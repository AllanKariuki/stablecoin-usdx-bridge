package bridge

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// FinalityChecker decides when a chain transaction is settled enough to act on.
//
// Two implementations, and the difference is where the waiting happens:
//
//   - ChainFinality asks the chain client, which blocks a goroutine polling an
//     RPC endpoint. On Sepolia with the default "finalized" level that is a
//     ~15 minute wait for a consensus checkpoint, per mint, held open in the
//     worker.
//
//   - IndexerFinality asks services/indexer, which is already watching. It
//     answers from state rather than from a poll, and the depth it answers
//     against is a number this platform chose (ETH_CONFIRMATIONS) rather than
//     one the consensus layer chose.
//
// The seam matters beyond latency: the indexer can distinguish "not seen yet"
// from "seen and then orphaned", which an RPC receipt poll cannot. A reorged
// mint looks identical to a slow one to the chain client, and the saga would
// wait for it forever.
type FinalityChecker interface {
	// WaitForFinality returns nil once txHash is settled on chain. A
	// ClassTerminal error means it never will be.
	WaitForFinality(ctx context.Context, chain, txHash string) error
}

// ChainFinality is the pre-P3 behaviour, kept as the default so a deployment
// with no indexer keeps working exactly as it did.
type ChainFinality struct {
	router *Router
	level  string
}

func NewChainFinality(router *Router, level string) *ChainFinality {
	return &ChainFinality{router: router, level: level}
}

func (c *ChainFinality) WaitForFinality(_ context.Context, chain, txHash string) error {
	client, ok := c.router.For(chain)
	if !ok {
		return fmt.Errorf("unknown chain %q", chain)
	}
	return client.WaitForFinality(txHash, c.level)
}

// ErrOrphaned means the chain took the transaction back: it was in a block
// that is no longer canonical.
//
// It is deliberately not a terminal error. A reorged transaction is very
// often re-included in a later block within seconds, and treating the first
// orphan observation as terminal would compensate a mint that is about to
// exist — which is R3's failure mode with a new cause. The saga retries; if
// it never comes back, the attempt budget runs out and it parks for a human,
// which is the correct outcome for "the chain and the ledger disagree about
// whether money was created".
var ErrOrphaned = errors.New("the transaction's block is no longer canonical")

// ErrNotFinalYet means the indexer has not yet seen enough confirmations.
var ErrNotFinalYet = errors.New("not enough confirmations yet")

// IndexerFinality asks services/indexer instead of a chain.
type IndexerFinality struct {
	baseURL string
	http    *http.Client
	logger  *slog.Logger

	// fallback is used when the indexer cannot answer — it is unreachable,
	// or it has never seen the transaction. An indexer outage must not stop
	// the platform minting; it should only cost the latency the indexer was
	// saving.
	fallback FinalityChecker
}

func NewIndexerFinality(baseURL string, fallback FinalityChecker, logger *slog.Logger) *IndexerFinality {
	return &IndexerFinality{
		baseURL:  strings.TrimRight(baseURL, "/"),
		http:     &http.Client{Timeout: 10 * time.Second},
		logger:   logger,
		fallback: fallback,
	}
}

type finalityResponse struct {
	Status        string `json:"status"` // UNSEEN | CONFIRMING | FINAL | ORPHANED
	BlockHeight   uint64 `json:"block_height"`
	Confirmations uint64 `json:"confirmations"`
	Required      uint64 `json:"required_confirmations"`
}

func (f *IndexerFinality) WaitForFinality(ctx context.Context, chain, txHash string) error {
	res, err := f.query(ctx, chain, txHash)
	if err != nil {
		f.logger.Warn("indexer could not answer a finality question; falling back to a chain poll",
			slog.String("chain", chain), slog.String("tx_hash", txHash), slog.Any("error", err))
		return f.fallback.WaitForFinality(ctx, chain, txHash)
	}

	switch res.Status {
	case "FINAL":
		return nil

	case "ORPHANED":
		return fmt.Errorf("%w: %s was in block %d", ErrOrphaned, txHash, res.BlockHeight)

	case "CONFIRMING":
		// A retryable "not yet". The worker's backoff is what does the
		// waiting now, instead of a goroutine parked on an RPC poll — which
		// is the whole point: N sagas in flight cost N rows in a queue, not N
		// blocked goroutines each holding a chain connection.
		return fmt.Errorf("%w: %d of %d confirmations", ErrNotFinalYet, res.Confirmations, res.Required)

	default: // UNSEEN
		// The indexer stays a confirmation depth behind the head by design,
		// so a transaction submitted seconds ago is legitimately unseen. That
		// is indistinguishable from an indexer that has stopped, so this
		// falls back rather than waiting: the chain client knows the
		// difference and this endpoint does not.
		return f.fallback.WaitForFinality(ctx, chain, txHash)
	}
}

func (f *IndexerFinality) query(ctx context.Context, chain, txHash string) (*finalityResponse, error) {
	endpoint := fmt.Sprintf("%s/finality/%s/%s", f.baseURL, url.PathEscape(chain), url.PathEscape(txHash))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}

	resp, err := f.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 8192))
	if err != nil {
		return nil, err
	}
	// 404 is a real answer (UNSEEN), not an error — the handler returns it
	// with a body, and treating it as a transport failure would mean falling
	// back on every transaction the indexer simply hasn't reached yet.
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNotFound {
		return nil, fmt.Errorf("indexer returned %s: %s", resp.Status, strings.TrimSpace(string(body)))
	}

	var out finalityResponse
	if err := json.Unmarshal(body, &out); err != nil {
		return nil, err
	}
	return &out, nil
}
