// Package api is the audit trail's surface: recording events, reading them,
// and proving them.
package api

import (
	"log/slog"
	"time"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/audit-trail/internal/chain"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/audit-trail/internal/store"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/shared/go/platform"

	"github.com/gofiber/fiber/v2"
)

type Handlers struct {
	store  *store.Store
	logger *slog.Logger
}

func New(st *store.Store, logger *slog.Logger) *Handlers {
	return &Handlers{store: st, logger: logger}
}

func (h *Handlers) Register(app *fiber.App) {
	// Recording is /internal: services post here, humans do not. It is absent
	// from the gateway's route table, whose default is deny.
	app.Post("/internal/events", h.record)

	app.Get("/audit/events", h.events)
	app.Get("/audit/events/:eventId/proof", h.proof)
	app.Get("/audit/anchors", h.anchors)
	app.Get("/audit/verify", h.verify)
}

// record accepts one event.
//
// Always 2xx once written. A producer that got a 500 from the audit trail
// would have to decide whether to fail the action it was auditing — and
// whichever it chose would be wrong: failing means an outage here stops the
// platform, and not failing means the action happens unaudited. So this
// endpoint is built to not fail, and its callers treat it as best-effort with
// the durable path being core-ledger's outbox.
func (h *Handlers) record(c *fiber.Ctx) error {
	var req struct {
		Actor       string         `json:"actor"`
		ActorRoles  []string       `json:"actor_roles"`
		OnBehalfOf  string         `json:"on_behalf_of"`
		Action      string         `json:"action"`
		SubjectType string         `json:"subject_type"`
		SubjectID   string         `json:"subject_id"`
		Service     string         `json:"service"`
		Outcome     string         `json:"outcome"`
		BeforeState map[string]any `json:"before_state"`
		AfterState  map[string]any `json:"after_state"`
		Metadata    map[string]any `json:"metadata"`
		RequestID   string         `json:"request_id"`
		SourceIP    string         `json:"source_ip"`
		UserAgent   string         `json:"user_agent"`
		OccurredAt  string         `json:"occurred_at"`
	}
	if err := c.BodyParser(&req); err != nil {
		return platform.WriteError(c, fiber.StatusBadRequest, "INVALID_REQUEST", "invalid request body")
	}
	if req.Action == "" || req.Actor == "" {
		return platform.WriteError(c, fiber.StatusBadRequest, "INVALID_REQUEST",
			"actor and action are required: an audit event that names neither is not evidence of anything")
	}

	occurredAt := time.Time{}
	if req.OccurredAt != "" {
		if parsed, err := time.Parse(time.RFC3339, req.OccurredAt); err == nil {
			occurredAt = parsed
		}
	}

	event := &store.Event{
		Actor:       req.Actor,
		ActorRoles:  req.ActorRoles,
		OnBehalfOf:  req.OnBehalfOf,
		Action:      req.Action,
		SubjectType: req.SubjectType,
		SubjectID:   req.SubjectID,
		Service:     req.Service,
		Outcome:     orDefault(req.Outcome, "SUCCESS"),
		BeforeState: req.BeforeState,
		AfterState:  req.AfterState,
		Metadata:    req.Metadata,
		RequestID:   req.RequestID,
		SourceIP:    orDefault(req.SourceIP, c.IP()),
		UserAgent:   req.UserAgent,
		OccurredAt:  occurredAt,
	}

	if err := h.store.Append(c.Context(), event); err != nil {
		h.logger.Error("could not record an audit event",
			slog.String("action", req.Action), slog.String("actor", req.Actor), slog.Any("error", err))
		return platform.WriteError(c, fiber.StatusInternalServerError, "AUDIT_WRITE_FAILED",
			"the event could not be recorded")
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"id":   event.ID,
		"seq":  event.Seq,
		"hash": event.Hash,
	})
}

func (h *Handlers) events(c *fiber.Ctx) error {
	events, err := h.store.Events(c.Context(), store.Filter{
		Actor:       c.Query("actor"),
		Action:      c.Query("action"),
		SubjectType: c.Query("subject_type"),
		SubjectID:   c.Query("subject_id"),
		RequestID:   c.Query("request_id"),
		Limit:       c.QueryInt("limit"),
	})
	if err != nil {
		return platform.WriteError(c, fiber.StatusInternalServerError, "INTERNAL", "could not read events")
	}

	out := make([]fiber.Map, 0, len(events))
	for _, e := range events {
		out = append(out, renderEvent(e))
	}
	return c.JSON(fiber.Map{"events": out})
}

// proof is the endpoint that makes an anchor useful.
//
// It returns one event, its inclusion proof, and the anchor's root — enough
// for anybody to verify the event was in the anchored set, using only the
// bytes returned and a SHA-256 implementation. No access to the rest of the
// log, which matters: the rest of the log is other people's activity.
func (h *Handlers) proof(c *fiber.Ctx) error {
	eventID := c.Params("eventId")

	anchor, events, index, err := h.store.AnchorFor(c.Context(), eventID)
	if err != nil {
		return platform.WriteError(c, fiber.StatusInternalServerError, "INTERNAL", "could not build the proof")
	}
	if anchor == nil {
		// Recorded but not yet anchored is a real, temporary state — said
		// plainly rather than returned as a missing event, because the
		// difference matters to whoever is asking.
		return c.Status(fiber.StatusAccepted).JSON(fiber.Map{
			"event_id": eventID,
			"anchored": false,
			"note":     "this event is recorded and hash-chained, but its window has not been anchored yet",
		})
	}
	if index < 0 {
		return platform.WriteError(c, fiber.StatusNotFound, "NOT_FOUND", "no such event")
	}

	leaves := make([][32]byte, len(events))
	for i, e := range events {
		leaves[i] = chain.HashLeaf(e.CanonicalBytes())
	}

	steps, err := chain.Proof(leaves, index)
	if err != nil {
		return platform.WriteError(c, fiber.StatusInternalServerError, "INTERNAL", "could not build the proof")
	}

	path := make([]fiber.Map, 0, len(steps))
	for _, step := range steps {
		path = append(path, fiber.Map{"hash": chain.Hex(step.Hash), "is_left": step.IsLeft})
	}

	return c.JSON(fiber.Map{
		"event":       renderEvent(events[index]),
		"leaf":        chain.Hex(leaves[index]),
		"proof":       path,
		"merkle_root": anchor.MerkleRoot,
		"anchor": fiber.Map{
			"id":           anchor.ID,
			"status":       anchor.Status,
			"chain":        anchor.Chain,
			"tx_hash":      anchor.TxHash,
			"event_count":  anchor.EventCount,
			"published_at": timeOrNil(anchor.PublishedAt),
		},
		// The algorithm, alongside the proof. An inclusion proof somebody
		// cannot independently check is a claim, not a proof — and the
		// details that matter (RFC 6962's domain separators, promotion rather
		// than duplication of an odd node) are exactly the ones a verifier
		// would otherwise guess wrong.
		"verification": fiber.Map{
			"algorithm": "SHA-256, RFC 6962 domain separation",
			"leaf_hash": "sha256(0x00 || canonical_event_bytes)",
			"node_hash": "sha256(0x01 || left || right)",
			"odd_node":  "promoted, never duplicated (CVE-2012-2459)",
			"steps":     "fold the proof: is_left ? node(sibling, acc) : node(acc, sibling)",
		},
	})
}

func (h *Handlers) anchors(c *fiber.Ctx) error {
	anchors, err := h.store.Anchors(c.Context(), c.QueryInt("limit"))
	if err != nil {
		return platform.WriteError(c, fiber.StatusInternalServerError, "INTERNAL", "could not read anchors")
	}
	out := make([]fiber.Map, 0, len(anchors))
	for _, a := range anchors {
		out = append(out, fiber.Map{
			"id":           a.ID,
			"from_seq":     a.FromSeq,
			"to_seq":       a.ToSeq,
			"event_count":  a.EventCount,
			"merkle_root":  a.MerkleRoot,
			"chain_tip":    a.ChainTip,
			"status":       a.Status,
			"chain":        a.Chain,
			"tx_hash":      a.TxHash,
			"published_at": timeOrNil(a.PublishedAt),
			"created_at":   a.CreatedAt.UTC().Format(time.RFC3339),
		})
	}
	return c.JSON(fiber.Map{"anchors": out})
}

func (h *Handlers) verify(c *fiber.Ctx) error {
	ok, brokenAt, checked, err := h.store.Verify(c.Context())
	if err != nil {
		return platform.WriteError(c, fiber.StatusInternalServerError, "INTERNAL", "could not verify the chain")
	}
	status := fiber.StatusOK
	if !ok {
		status = fiber.StatusConflict
	}
	return c.Status(status).JSON(fiber.Map{
		"intact":       ok,
		"events":       checked,
		"first_broken": brokenAt,
	})
}

func renderEvent(e store.Event) fiber.Map {
	return fiber.Map{
		"id":           e.ID,
		"seq":          e.Seq,
		"actor":        e.Actor,
		"actor_roles":  e.ActorRoles,
		"on_behalf_of": e.OnBehalfOf,
		"action":       e.Action,
		"subject_type": e.SubjectType,
		"subject_id":   e.SubjectID,
		"service":      e.Service,
		"outcome":      e.Outcome,
		"before_state": e.BeforeState,
		"after_state":  e.AfterState,
		"metadata":     e.Metadata,
		"request_id":   e.RequestID,
		"occurred_at":  e.OccurredAt.UTC().Format(time.RFC3339Nano),
		"hash":         e.Hash,
		"prev_hash":    e.PrevHash,
		"anchor_id":    emptyToNil(e.AnchorID),
	}
}

func orDefault(v, fallback string) string {
	if v == "" {
		return fallback
	}
	return v
}

func emptyToNil(v string) any {
	if v == "" {
		return nil
	}
	return v
}

func timeOrNil(t *time.Time) any {
	if t == nil {
		return nil
	}
	return t.UTC().Format(time.RFC3339)
}
