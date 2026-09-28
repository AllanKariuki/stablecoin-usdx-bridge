// Package api is the indexer's read surface.
//
// It serves two audiences. Operators ask "what happened on chain", which is a
// query over chain_events. The saga asks "is this transaction final", which is
// the question that lets WaitForFinality stop blocking a goroutine on an RPC
// poll — and on Sepolia, stop waiting ~15 minutes for a `finalized` checkpoint
// when the platform's own confirmation depth is the number that actually
// governs whether it will mint against it.
package api

import (
	"context"
	"log/slog"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/indexer/internal/store"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/shared/go/platform"

	"github.com/gofiber/fiber/v2"
)

// HeadReader reports a chain's current height, so confirmations can be
// computed against something live rather than against the cursor (which lags
// by the confirmation depth and would make every transaction look exactly
// `depth` confirmations deep forever).
type HeadReader interface {
	Head(ctx context.Context) (uint64, error)
}

type Handlers struct {
	store  *store.Store
	logger *slog.Logger
	heads  map[string]HeadReader

	// confirmations is the depth at which the indexer calls a transaction
	// final, per chain. It is the same number the tailer stays behind by, so
	// "final" and "recorded as canonical" mean the same thing.
	confirmations map[string]uint64
}

func New(st *store.Store, logger *slog.Logger, heads map[string]HeadReader, confirmations map[string]uint64) *Handlers {
	return &Handlers{store: st, logger: logger, heads: heads, confirmations: confirmations}
}

func (h *Handlers) Register(app *fiber.App) {
	app.Get("/events", h.listEvents)
	app.Get("/finality/:chain/:txHash", h.finality)
	app.Get("/cursors", h.cursors)
}

func (h *Handlers) listEvents(c *fiber.Ctx) error {
	events, err := h.store.Events(c.Context(), store.EventFilter{
		Chain:         c.Query("chain"),
		EventType:     c.Query("event_type"),
		CorrelationID: c.Query("correlation_id"),
		TxHash:        c.Query("tx_hash"),
		// Orphaned events are hidden by default and retrievable on request.
		// A consumer reconciling its own state after a reorg needs to see
		// what it acted on; a dashboard does not.
		IncludeOrphan: c.QueryBool("include_orphaned"),
		Limit:         c.QueryInt("limit"),
	})
	if err != nil {
		return platform.WriteError(c, fiber.StatusInternalServerError, "INTERNAL", "could not read events")
	}

	out := make([]fiber.Map, 0, len(events))
	for _, e := range events {
		out = append(out, fiber.Map{
			"id":             e.ID,
			"chain":          e.Chain,
			"event_type":     e.EventType,
			"contract":       e.Contract,
			"block_height":   e.BlockHeight,
			"block_hash":     e.BlockHash,
			"tx_hash":        e.TxHash,
			"log_index":      e.LogIndex,
			"correlation_id": e.CorrelationID,
			"payload":        e.Payload,
			"block_time":     e.BlockTime,
		})
	}
	return c.JSON(fiber.Map{"events": out})
}

// finality answers the saga's question.
//
// Three distinguishable answers, and the distinction is the whole value:
// "not seen" (keep waiting), "seen but orphaned" (the chain took it back —
// do not settle, and do not compensate a mint that may yet reappear), and
// "seen with N confirmations". A boolean would collapse the middle case into
// the first and turn a reorg into an indefinite wait.
func (h *Handlers) finality(c *fiber.Ctx) error {
	chain := c.Params("chain")
	txHash := c.Params("txHash")

	head, err := h.head(c.Context(), chain)
	if err != nil {
		return platform.WriteError(c, fiber.StatusServiceUnavailable, "CHAIN_UNREACHABLE",
			"could not read the chain head: "+err.Error())
	}

	f, err := h.store.Finality(c.Context(), chain, txHash, head)
	if err != nil {
		return platform.WriteError(c, fiber.StatusInternalServerError, "INTERNAL", "could not read finality")
	}
	if !f.Found {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"chain": chain, "tx_hash": txHash, "status": "UNSEEN",
			"head": head,
		})
	}

	status := "CONFIRMING"
	switch {
	case !f.Canonical:
		status = "ORPHANED"
	case f.Confirmations >= h.confirmations[chain]:
		status = "FINAL"
	}

	return c.JSON(fiber.Map{
		"chain":                  chain,
		"tx_hash":                txHash,
		"status":                 status,
		"block_height":           f.BlockHeight,
		"confirmations":          f.Confirmations,
		"required_confirmations": h.confirmations[chain],
		"head":                   head,
	})
}

func (h *Handlers) cursors(c *fiber.Ctx) error {
	out := fiber.Map{}
	for chain := range h.heads {
		height, hash, err := h.store.Cursor(c.Context(), chain)
		if err != nil {
			continue
		}
		row := fiber.Map{"height": height, "block_hash": hash}
		if head, err := h.head(c.Context(), chain); err == nil {
			row["head"] = head
			// Lag is the number an alert watches: a cursor that stops
			// advancing is indistinguishable from a quiet chain until you
			// compare it to the head.
			if head > height {
				row["lag"] = head - height
			} else {
				row["lag"] = 0
			}
		}
		out[chain] = row
	}
	return c.JSON(fiber.Map{"cursors": out})
}

func (h *Handlers) head(ctx context.Context, chain string) (uint64, error) {
	reader, ok := h.heads[chain]
	if !ok {
		return 0, errUnknownChain{chain}
	}
	return reader.Head(ctx)
}

type errUnknownChain struct{ chain string }

func (e errUnknownChain) Error() string { return "unknown chain " + e.chain }
