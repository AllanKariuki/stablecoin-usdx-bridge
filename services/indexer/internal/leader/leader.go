// Package leader makes exactly one indexer replica advance the cursor.
//
// The plan called for a Kubernetes Lease. This uses a Postgres advisory lock
// instead, for the same reason core-ledger's saga takes one
// (`pg_try_advisory_lock` in ledger.Repository.WithAdvisoryLock): the lock
// lives in the same system as the state it protects, so it cannot be held by a
// process that has lost its connection to that state. A Lease is held in the
// API server, which a partitioned pod can keep renewing while being unable to
// reach the database — and a second indexer advancing the same cursor is
// precisely the failure a leader election exists to prevent.
//
// It also means the indexer runs correctly under docker-compose, where there
// is no API server to hold a Lease at all. infra/k8s/indexer-deployment.yaml
// still runs a single replica, so the lock is a second line rather than the
// only one.
package leader

import (
	"context"
	"database/sql"
	"hash/fnv"
	"log/slog"
	"time"
)

// Election holds a session-scoped advisory lock and reports whether this
// process currently leads.
//
// Session-scoped rather than transaction-scoped is the important part: the
// lock is held for as long as the connection lives and is released
// automatically when it dies — including when the process is SIGKILLed, which
// is the case a heartbeat-based scheme has to guess about.
type Election struct {
	db     *sql.DB
	key    int64
	logger *slog.Logger

	conn *sql.Conn
}

func New(db *sql.DB, name string, logger *slog.Logger) *Election {
	h := fnv.New64a()
	_, _ = h.Write([]byte(name))
	return &Election{db: db, key: int64(h.Sum64()), logger: logger}
}

// Campaign blocks until this process is the leader or ctx is done.
//
// It polls rather than using pg_advisory_lock's blocking form so that a
// SIGTERM during the wait is honoured promptly: a pod stuck inside a blocking
// lock acquisition ignores its own shutdown signal until the lock frees, which
// turns a rolling deploy into a stall.
func (e *Election) Campaign(ctx context.Context, poll time.Duration) error {
	for {
		acquired, err := e.tryAcquire(ctx)
		if err != nil {
			return err
		}
		if acquired {
			e.logger.Info("elected leader; this replica advances the cursor")
			return nil
		}

		e.logger.Info("another replica holds the indexer lock; standing by", slog.Duration("retry_in", poll))
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(poll):
		}
	}
}

func (e *Election) tryAcquire(ctx context.Context) (bool, error) {
	conn, err := e.db.Conn(ctx)
	if err != nil {
		return false, err
	}
	var ok bool
	if err := conn.QueryRowContext(ctx, "SELECT pg_try_advisory_lock($1)", e.key).Scan(&ok); err != nil {
		_ = conn.Close()
		return false, err
	}
	if !ok {
		// Returning the connection is what releases the *attempt*; the lock
		// itself was never taken.
		_ = conn.Close()
		return false, nil
	}
	e.conn = conn
	return true, nil
}

// Release hands leadership on. Called on graceful shutdown so a rolling deploy
// does not leave the new pod waiting out a poll interval for a lock the old
// one has already stopped using.
func (e *Election) Release(ctx context.Context) {
	if e.conn == nil {
		return
	}
	if _, err := e.conn.ExecContext(ctx, "SELECT pg_advisory_unlock($1)", e.key); err != nil {
		e.logger.Warn("could not release the indexer lock; it frees when the connection closes",
			slog.Any("error", err))
	}
	_ = e.conn.Close()
	e.conn = nil
}

// Leading reports whether the lock is still held by a live connection. The
// ping matters: a connection killed server-side (a failover, an idle timeout)
// releases the lock, and a replica that kept indexing on the strength of a
// stale boolean is the split-brain this package exists to prevent.
func (e *Election) Leading(ctx context.Context) bool {
	if e.conn == nil {
		return false
	}
	return e.conn.PingContext(ctx) == nil
}
