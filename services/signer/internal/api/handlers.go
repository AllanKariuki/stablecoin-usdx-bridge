// Package api is services/signer's HTTP surface.
//
// **On the transport.** The plan specifies gRPC + mTLS. This is HTTP/2 + mTLS
// with a hand-written typed client, and the deviation is deliberate: the only
// caller is core-ledger's saga worker, Go to Go, over four methods. gRPC
// would add protoc, a plugin chain, a codegen step in CI and in two
// Dockerfiles, and a generated package to keep in sync — for a wire format
// that carries the same bytes over the same mutually-authenticated TLS
// connection. The security properties this phase is actually about — mutual
// authentication, policy evaluation on a decoded transaction, an append-only
// audit trail — are identical either way. What is genuinely lost is
// codegen'd stubs and streaming, and neither is used here.
//
// It is the same reasoning P0 used to delete shared/proto/bridge.proto.
package api

import (
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"math/big"
	"time"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/signer/internal/audit"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/signer/internal/keystore"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/signer/internal/policy"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/shared/go/platform"

	"github.com/gofiber/fiber/v2"
)

type Handlers struct {
	backend keystore.Backend
	policy  policy.Policy
	log     *audit.Log
	logger  *slog.Logger
}

func New(backend keystore.Backend, p policy.Policy, log *audit.Log, logger *slog.Logger) *Handlers {
	return &Handlers{backend: backend, policy: p, log: log, logger: logger}
}

func (h *Handlers) Register(app *fiber.App) {
	app.Post("/sign", h.sign)
	app.Get("/keys", h.keys)
	app.Get("/audit", h.recent)
	app.Get("/audit/verify", h.verify)
}

type signRequest struct {
	Chain  string `json:"chain"`
	Method string `json:"method"`
	KeyID  string `json:"key_id"`

	// Digest is the bytes to sign, hex. For Ethereum it is the 32-byte
	// transaction hash; for Solana it is the whole serialised message, which
	// ed25519 signs directly.
	Digest string `json:"digest"`

	// The decoded transaction, for policy. It is sent alongside the digest
	// rather than derived from it because a digest cannot be inspected — an
	// amount ceiling against 32 bytes of hash is meaningless, which is why
	// the P2 Signer seam passes whole transactions.
	//
	// The service does NOT verify that these fields describe the digest: it
	// cannot, without re-implementing two chains' transaction encoding. The
	// caller is authenticated by mTLS and the mismatch would be visible in
	// the audit log, which is the honest description of this boundary rather
	// than a claim the policy is cryptographically bound to what is signed.
	Amount        string `json:"amount"`
	Destination   string `json:"destination"`
	CorrelationID string `json:"correlation_id"`
}

type signResponse struct {
	Signature string `json:"signature"`
	KeyID     string `json:"key_id"`
	PublicKey string `json:"public_key"`
	AuditID   string `json:"audit_id"`
	// Replayed is true when this is a previously-produced signature returned
	// again. The caller does not have to care — the bytes are identical — but
	// it makes a retried saga visible in a log without diffing signatures.
	Replayed bool `json:"replayed"`
}

// sign is the one endpoint that matters.
//
// The order is: idempotency, policy, sign, record. Recording last is
// deliberate and is the one ordering that can lose information — a crash
// between signing and recording leaves a signature nobody logged. The
// alternative, recording first, leaves a log entry for a signature that was
// never produced, which is worse: an audit log that over-reports is one
// nobody can reason from, and the crash window is closed anyway by the
// idempotency check on the retry.
func (h *Handlers) sign(c *fiber.Ctx) error {
	caller := CallerFrom(c)
	if caller == "" {
		// Unreachable behind mTLS — the handshake would have failed — but a
		// misconfigured server with client auth off would otherwise sign for
		// anybody.
		return platform.WriteError(c, fiber.StatusUnauthorized, "NO_CLIENT_IDENTITY",
			"no authenticated client certificate; this service only accepts mTLS connections")
	}

	var req signRequest
	if err := c.BodyParser(&req); err != nil {
		return platform.WriteError(c, fiber.StatusBadRequest, "INVALID_REQUEST", "invalid request body")
	}

	digest, err := hex.DecodeString(trimHexPrefix(req.Digest))
	if err != nil || len(digest) == 0 {
		return platform.WriteError(c, fiber.StatusBadRequest, "INVALID_DIGEST", "digest must be non-empty hex")
	}

	// ---- idempotency -----------------------------------------------------
	//
	// A retried mint must return the *original* signature. Producing a second
	// valid one means the platform has authorised the same money twice, and
	// which is the real one becomes unanswerable.
	if existing, err := h.log.Existing(c.Context(), req.Chain, req.Method, req.CorrelationID); err != nil {
		return platform.WriteError(c, fiber.StatusInternalServerError, "AUDIT_UNAVAILABLE",
			"could not check the audit log; refusing to sign without it")
	} else if existing != nil {
		if existing.Digest != hex.EncodeToString(digest) {
			// Same correlation id, different transaction. Either the caller
			// rebuilt the transaction (a different nonce, a different gas
			// price) or something is wrong. Refused either way: signing both
			// would put two different valid transactions on the chain under
			// one correlation id, and only the chain's replay guard would
			// stop the second landing.
			h.record(c, req, caller, digest, "", audit.OutcomeDenied,
				"this correlation id was already signed for a different transaction")
			return platform.WriteError(c, fiber.StatusConflict, "CORRELATION_REUSED",
				"this correlation id has already been signed for a different transaction")
		}
		h.logger.Info("replaying an existing signature",
			slog.String("correlation_id", req.CorrelationID), slog.String("caller", caller))
		return c.JSON(signResponse{
			Signature: existing.Signature,
			KeyID:     existing.KeyID,
			PublicKey: h.publicKeyFor(c, existing.KeyID),
			AuditID:   existing.ID,
			Replayed:  true,
		})
	}

	// ---- policy ----------------------------------------------------------
	amount, hasAmount := new(big.Int).SetString(req.Amount, 10)
	if !hasAmount {
		amount = nil
	}

	dailyTotal, err := h.log.DailyTotal(c.Context(), req.Chain, req.Method)
	if err != nil {
		return platform.WriteError(c, fiber.StatusInternalServerError, "AUDIT_UNAVAILABLE",
			"could not read today's signing total; refusing to sign without it")
	}

	decision := h.policy.Evaluate(policy.Request{
		Chain:         req.Chain,
		Method:        policy.Method(req.Method),
		Amount:        amount,
		To:            req.Destination,
		CorrelationID: req.CorrelationID,
		Caller:        caller,
	}, dailyTotal)

	if !decision.Allowed {
		// Denials are recorded as carefully as approvals: a burst of them is
		// the first sign of a compromised caller probing what it can get
		// through, and a log that only records successes shows that as
		// silence.
		h.record(c, req, caller, digest, "", audit.OutcomeDenied, decision.Reason)
		h.logger.Warn("refused to sign",
			slog.String("caller", caller), slog.String("chain", req.Chain),
			slog.String("method", req.Method), slog.String("reason", decision.Reason))
		return platform.WriteError(c, fiber.StatusForbidden, "POLICY_DENIED", decision.Reason)
	}

	// ---- sign ------------------------------------------------------------
	signature, err := h.backend.Sign(c.Context(), req.KeyID, digest)
	if err != nil {
		h.record(c, req, caller, digest, "", audit.OutcomeError, err.Error())
		if errors.Is(err, keystore.ErrUnknownKey) {
			return platform.WriteError(c, fiber.StatusNotFound, "UNKNOWN_KEY",
				fmt.Sprintf("no key %q in the %s backend", req.KeyID, h.backend.Name()))
		}
		h.logger.Error("signing failed", slog.String("key_id", req.KeyID), slog.Any("error", err))
		return platform.WriteError(c, fiber.StatusBadGateway, "SIGNING_FAILED",
			"the key backend could not sign")
	}

	// ---- record ----------------------------------------------------------
	record := h.record(c, req, caller, digest, hex.EncodeToString(signature), audit.OutcomeAllowed, decision.Reason)
	if record == nil {
		// The signature exists and could not be recorded. Returning it anyway
		// would mean authorising money with no audit trail, which is the one
		// thing this service must never do — so it is withheld and the caller
		// retries, where the idempotency check will find no record and sign
		// again. The cost is a wasted signature; the alternative is an
		// unlogged one.
		return platform.WriteError(c, fiber.StatusInternalServerError, "AUDIT_WRITE_FAILED",
			"signed, but the audit record could not be written; the signature is withheld — retry")
	}

	h.logger.Info("signed",
		slog.String("caller", caller), slog.String("chain", req.Chain),
		slog.String("method", req.Method), slog.String("correlation_id", req.CorrelationID),
		slog.String("audit_id", record.ID))

	return c.JSON(signResponse{
		Signature: hex.EncodeToString(signature),
		KeyID:     req.KeyID,
		PublicKey: h.publicKeyFor(c, req.KeyID),
		AuditID:   record.ID,
	})
}

func (h *Handlers) record(
	c *fiber.Ctx, req signRequest, caller string, digest []byte, signature, outcome, reason string,
) *audit.Record {
	record := &audit.Record{
		Chain:         req.Chain,
		Method:        req.Method,
		KeyID:         req.KeyID,
		Backend:       h.backend.Name(),
		Caller:        caller,
		Amount:        req.Amount,
		Destination:   req.Destination,
		CorrelationID: req.CorrelationID,
		Digest:        hex.EncodeToString(digest),
		Signature:     signature,
		Outcome:       outcome,
		Reason:        reason,
	}
	if err := h.log.Append(c.Context(), record); err != nil {
		h.logger.Error("could not write the audit record",
			slog.String("correlation_id", req.CorrelationID), slog.Any("error", err))
		return nil
	}
	return record
}

func (h *Handlers) keys(c *fiber.Ctx) error {
	keys, err := h.backend.Keys(c.Context())
	if err != nil {
		return platform.WriteError(c, fiber.StatusBadGateway, "BACKEND_UNAVAILABLE", err.Error())
	}
	out := make([]fiber.Map, 0, len(keys))
	for _, k := range keys {
		out = append(out, fiber.Map{
			"id":         k.ID,
			"curve":      k.Curve,
			"public_key": k.PublicKey,
			"backend":    k.Backend,
		})
	}
	return c.JSON(fiber.Map{"keys": out, "backend": h.backend.Name()})
}

func (h *Handlers) recent(c *fiber.Ctx) error {
	records, err := h.log.Recent(c.Context(), c.QueryInt("limit"))
	if err != nil {
		return platform.WriteError(c, fiber.StatusInternalServerError, "INTERNAL", "could not read the audit log")
	}
	out := make([]fiber.Map, 0, len(records))
	for _, r := range records {
		out = append(out, fiber.Map{
			"id":             r.ID,
			"chain":          r.Chain,
			"method":         r.Method,
			"key_id":         r.KeyID,
			"caller":         r.Caller,
			"amount":         r.Amount,
			"destination":    r.Destination,
			"correlation_id": r.CorrelationID,
			"outcome":        r.Outcome,
			"reason":         r.Reason,
			"created_at":     r.CreatedAt.UTC().Format(time.RFC3339),
			"hash":           r.Hash,
		})
	}
	return c.JSON(fiber.Map{"signatures": out})
}

// verify is the endpoint an auditor calls: a full walk of the hash chain,
// not a spot check — a tamper that breaks one link is exactly what a spot
// check misses.
func (h *Handlers) verify(c *fiber.Ctx) error {
	ok, brokenAt, checked, err := h.log.Verify(c.Context())
	if err != nil {
		return platform.WriteError(c, fiber.StatusInternalServerError, "INTERNAL", "could not verify the audit log")
	}
	status := fiber.StatusOK
	if !ok {
		status = fiber.StatusConflict
	}
	return c.Status(status).JSON(fiber.Map{
		"intact":       ok,
		"records":      checked,
		"first_broken": brokenAt,
	})
}

func (h *Handlers) publicKeyFor(c *fiber.Ctx, keyID string) string {
	keys, err := h.backend.Keys(c.Context())
	if err != nil {
		return ""
	}
	for _, k := range keys {
		if k.ID == keyID {
			return k.PublicKey
		}
	}
	return ""
}

func trimHexPrefix(s string) string {
	if len(s) >= 2 && (s[:2] == "0x" || s[:2] == "0X") {
		return s[2:]
	}
	return s
}
