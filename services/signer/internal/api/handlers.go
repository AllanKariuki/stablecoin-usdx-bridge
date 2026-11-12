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
	"context"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"math/big"
	"strings"
	"time"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/signer/internal/audit"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/signer/internal/decode"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/signer/internal/keystore"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/signer/internal/policy"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/shared/go/platform"

	"github.com/gofiber/fiber/v2"
)

// AuditLog is what the handlers need from internal/audit. An interface so the
// refusal paths can be tested without Postgres; the database properties
// behind it (the unique index, the payload check under SERIALIZABLE) are
// tested in internal/audit against a real one.
type AuditLog interface {
	Existing(ctx context.Context, chain, method, correlationID, digest string) (*audit.Record, error)
	DailyTotal(ctx context.Context, chain, method, exclude string) (*big.Int, error)
	Append(ctx context.Context, r *audit.Record) error
	Recent(ctx context.Context, limit int) ([]audit.Record, error)
	Verify(ctx context.Context) (ok bool, brokenAt string, checked int, err error)
}

type Handlers struct {
	backend    keystore.Backend
	policy     policy.Policy
	deployment decode.Deployment
	log        AuditLog
	logger     *slog.Logger
}

func New(backend keystore.Backend, p policy.Policy, dep decode.Deployment, log AuditLog, logger *slog.Logger) *Handlers {
	return &Handlers{backend: backend, policy: p, deployment: dep, log: log, logger: logger}
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

	// Tx is the unsigned Ethereum transaction (binary, hex). Required for
	// Ethereum: the signer decodes it, proves the digest is its hash, and takes
	// method, amount and destination from the calldata. Solana needs no
	// separate field because the digest IS the serialised message.
	Tx string `json:"tx"`

	// Method, Amount and Destination are the caller's CLAIM about what it is
	// signing. They are not trusted: the signer derives the real values from
	// the bytes (package decode), uses those for policy and the audit log, and
	// refuses the request if a claim disagrees with what was decoded.
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
// The order is: decode, idempotency, policy, sign, record. Recording last is
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

	// One spelling per chain, so "solana" and "SOLANA" are not two
	// idempotency keys for the same movement.
	req.Chain = strings.ToUpper(req.Chain)

	// ---- decode ----------------------------------------------------------
	//
	// Policy runs against what the bytes say, not what the caller says. A
	// compromised caller can describe a 10,000,000 mint as a 1 mint; it cannot
	// make the transaction say so.
	//
	// Decoding comes before idempotency, because the idempotency key is only
	// meaningful once the correlation id is proven to be the one the bytes
	// carry: otherwise an already-signed transaction presented under a fresh
	// correlation id finds no record and is signed again.
	decoded, derr := h.decodeRequest(req, digest)
	if derr == nil {
		derr = decode.Reconcile(decoded, req.Method, req.Amount, req.Destination)
	}
	if derr == nil {
		derr = decode.BindCorrelation(decoded, req.CorrelationID)
	}
	if derr != nil {
		reason := "unverifiable request: " + derr.Error()
		h.record(c, req, caller, digest, "", "", audit.OutcomeDenied, reason)
		h.logger.Warn("refused to sign", slog.String("caller", caller), slog.String("reason", reason))
		return platform.WriteError(c, fiber.StatusForbidden, "POLICY_DENIED", reason)
	}
	// From here on, the decoded values replace the claimed ones everywhere.
	req.Method, req.Destination = decoded.Method, decoded.Destination
	req.Amount = ""
	if decoded.Amount != nil {
		req.Amount = decoded.Amount.String()
	}
	payload := decoded.PayloadDigest(req.Chain)

	// ---- idempotency -----------------------------------------------------
	//
	// A retried mint must return the *original* signature. Producing a second
	// valid one for a different movement means the platform has authorised
	// two things under one correlation id, and which is the real one becomes
	// unanswerable.
	existing, err := h.log.Existing(c.Context(), req.Chain, req.Method, req.CorrelationID, hex.EncodeToString(digest))
	if err != nil {
		return platform.WriteError(c, fiber.StatusInternalServerError, "AUDIT_UNAVAILABLE",
			"could not check the audit log; refusing to sign without it")
	}
	switch idempotencyFor(existing, hex.EncodeToString(digest), payload) {
	case replay:
		h.logger.Info("replaying an existing signature",
			slog.String("correlation_id", req.CorrelationID), slog.String("caller", caller))
		return c.JSON(signResponse{
			Signature: existing.Signature,
			KeyID:     existing.KeyID,
			PublicKey: h.publicKeyFor(c, existing.KeyID),
			AuditID:   existing.ID,
			Replayed:  true,
		})
	case conflict:
		return h.correlationReused(c, req, caller, digest, payload)
	case resign:
		// Same authorisation, rebuilt transaction (new nonce, gas or
		// blockhash). Signed again, through policy as usual: the on-chain id
		// in the payload is this correlation id, so the chain's replay guard
		// lets at most one of the two land.
		h.logger.Info("re-signing a rebuilt transaction for an existing correlation",
			slog.String("correlation_id", req.CorrelationID), slog.String("caller", caller))
	}

	// ---- policy ----------------------------------------------------------
	amount, hasAmount := new(big.Int).SetString(req.Amount, 10)
	if !hasAmount {
		amount = nil
	}

	// Excluding this correlation id, so a re-sign is "everything else today
	// plus this movement", not this movement counted twice.
	dailyTotal, err := h.log.DailyTotal(c.Context(), req.Chain, req.Method, req.CorrelationID)
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
		h.record(c, req, caller, digest, payload, "", audit.OutcomeDenied, decision.Reason)
		h.logger.Warn("refused to sign",
			slog.String("caller", caller), slog.String("chain", req.Chain),
			slog.String("method", req.Method), slog.String("reason", decision.Reason))
		return platform.WriteError(c, fiber.StatusForbidden, "POLICY_DENIED", decision.Reason)
	}

	// ---- sign ------------------------------------------------------------
	signature, err := h.backend.Sign(c.Context(), req.KeyID, digest)
	if err != nil {
		h.record(c, req, caller, digest, payload, "", audit.OutcomeError, err.Error())
		if errors.Is(err, keystore.ErrUnknownKey) {
			return platform.WriteError(c, fiber.StatusNotFound, "UNKNOWN_KEY",
				fmt.Sprintf("no key %q in the %s backend", req.KeyID, h.backend.Name()))
		}
		h.logger.Error("signing failed", slog.String("key_id", req.KeyID), slog.Any("error", err))
		return platform.WriteError(c, fiber.StatusBadGateway, "SIGNING_FAILED",
			"the key backend could not sign")
	}

	// ---- record ----------------------------------------------------------
	record, err := h.record(c, req, caller, digest, payload, hex.EncodeToString(signature), audit.OutcomeAllowed, decision.Reason)
	if errors.Is(err, audit.ErrPayloadMismatch) {
		// Another replica bound this correlation id to a different payload
		// between our Existing check and this append. The signature is
		// withheld, exactly as if the check had caught it.
		return h.correlationReused(c, req, caller, digest, payload)
	}
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

// idempotency is what a request is, relative to what this correlation id has
// already been signed for.
type idempotency int

const (
	fresh    idempotency = iota // nothing signed yet
	replay                      // these exact bytes were signed: return that signature
	resign                      // same payload, rebuilt bytes: sign again
	conflict                    // a different payload: refuse
)

// idempotencyFor decides it. Pure, so the table of cases is testable without
// a database.
//
// A record with no payload digest predates migration 00002: nothing says what
// it authorised beyond its bytes, so only those exact bytes may follow it.
func idempotencyFor(existing *audit.Record, digest, payload string) idempotency {
	switch {
	case existing == nil:
		return fresh
	case existing.Digest == digest:
		return replay
	case existing.PayloadDigest != "" && existing.PayloadDigest == payload:
		return resign
	default:
		return conflict
	}
}

// correlationReused refuses a request whose correlation id is already bound
// to a different payload. A conflict rather than a policy denial: nothing
// about the request is out of policy, it is just not the movement this
// correlation id already authorised.
func (h *Handlers) correlationReused(c *fiber.Ctx, req signRequest, caller string, digest []byte, payload string) error {
	const reason = "this correlation id was already signed for a different payload"
	h.record(c, req, caller, digest, payload, "", audit.OutcomeDenied, reason)
	h.logger.Warn("refused to sign", slog.String("caller", caller),
		slog.String("correlation_id", req.CorrelationID), slog.String("reason", reason))
	return platform.WriteError(c, fiber.StatusConflict, "CORRELATION_REUSED", reason)
}

func (h *Handlers) decodeRequest(req signRequest, digest []byte) (*decode.Decoded, error) {
	switch req.Chain {
	case "ETHEREUM":
		raw, err := hex.DecodeString(trimHexPrefix(req.Tx))
		if err != nil {
			return nil, errors.New("tx must be hex")
		}
		return decode.Ethereum(raw, digest, h.deployment)
	case "SOLANA":
		return decode.Solana(digest, h.deployment, req.Destination)
	default:
		return nil, fmt.Errorf("unsupported chain %q", req.Chain)
	}
}

// record appends to the audit log. Its error matters only to the ALLOWED
// path, which withholds the signature if it cannot be recorded; denials are
// best-effort, since refusing is the safe outcome whether or not it was
// logged.
func (h *Handlers) record(
	c *fiber.Ctx, req signRequest, caller string, digest []byte, payload, signature, outcome, reason string,
) (*audit.Record, error) {
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
		PayloadDigest: payload,
		Signature:     signature,
		Outcome:       outcome,
		Reason:        reason,
	}
	if err := h.log.Append(c.Context(), record); err != nil {
		h.logger.Error("could not write the audit record",
			slog.String("correlation_id", req.CorrelationID), slog.Any("error", err))
		return nil, err
	}
	return record, nil
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
