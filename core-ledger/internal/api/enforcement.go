package api

// H6: compliance enforcement actions (BLACKLIST/UNBLACKLIST/PAUSE/UNPAUSE)
// actually land on chain — durably and asynchronously.
//
// services/compliance runs maker-checker first — an action only reaches this
// route after a workflow approval — then submits here. core-ledger is the
// only service holding the chain clients and the Signer seam, which is what
// made the pre-H6 behavior (approved forever, never submitted) the right
// thing to *stop* doing rather than to patch around.
//
// The route submits and returns 202 — it never waits for finality. Sepolia's
// finalized checkpoint trails the head by two epochs (13–18 minutes), which
// outlasts any timeout a caller can hold, and the first synchronous version
// proved it: the wait expired, the caller saw a 502, and the idempotency key
// released — so a retry would have submitted the action twice. The
// chain_enforcements row (keyed by the compliance action id) is what makes
// the retry safe instead: the FIRST thing the route does is record the
// reference; any later request for the same reference returns the stored
// state and submits nothing. The worker's sweep (internal/enforcement)
// observes finality on its own schedule and finalizes the row, and the
// outbox event it enqueues is what compliance consumes to mark its action
// EXECUTED.
//
// The one rule that must never break: **a reference that ever obtained a
// transaction hash is never resubmitted.** The transaction may be in flight
// or mined; submitting again would double-execute the action. Only a
// reference whose submission failed before producing a hash may be retried,
// which is why a transient submit failure deletes the row.

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/bridge"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/ledger"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/shared/go/platform"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/shared/go/platform/audit"

	"github.com/ethereum/go-ethereum/common"
	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
)

// enforcementRequest is the body services/compliance posts. Reference is the
// compliance action id (enf_…) — the chain_enforcements primary key, the
// dedupe that makes retries safe, and what the sweep's outbox event is keyed
// on.
type enforcementRequest struct {
	Action    string `json:"action"`    // BLACKLIST | UNBLACKLIST | PAUSE | UNPAUSE
	Chain     string `json:"chain"`     // ETHEREUM | SOLANA
	Address   string `json:"address"`   // required for (UN)BLACKLIST
	Reference string `json:"reference"` // the compliance action id
}

const (
	enforcementActionBlacklist   = "BLACKLIST"
	enforcementActionUnblacklist = "UNBLACKLIST"
	enforcementActionPause       = "PAUSE"
	enforcementActionUnpause     = "UNPAUSE"
)

// staleSubmittedAge is how long a SUBMITTED row with no transaction hash may
// sit before the route declares its outcome unknown. Such a row means the
// submission was cut off between broadcasting and recording the hash — the
// only window in which the route cannot know whether a transaction exists —
// so it is failed with a reason that tells the operator to look at the chain,
// never resubmitted.
const staleSubmittedAge = 30 * time.Second

// enforcement submits one approved compliance action on chain, once, and
// returns 202 as soon as the transaction is broadcast. Finality is the
// worker's job; the row's stored state is what every later request for the
// reference sees.
func (h *Handlers) enforcement(c *fiber.Ctx) error {
	var req enforcementRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	req.Action = strings.ToUpper(req.Action)
	req.Chain = strings.ToUpper(req.Chain)

	switch req.Action {
	case enforcementActionBlacklist, enforcementActionUnblacklist,
		enforcementActionPause, enforcementActionUnpause:
	default:
		return unprocessable(c, "UNKNOWN_ACTION",
			"action must be one of BLACKLIST, UNBLACKLIST, PAUSE, UNPAUSE")
	}
	if req.Reference == "" {
		return badRequest(c, "reference is required: the compliance action id that authorized this submission")
	}

	if req.Action == enforcementActionBlacklist || req.Action == enforcementActionUnblacklist {
		if req.Address == "" {
			return badRequest(c, "address is required: blacklisting names the account it acts on")
		}
		if !common.IsHexAddress(req.Address) {
			return badRequest(c, "address is not a valid Ethereum address")
		}
		// The Solana program has no blacklist — not a gap this route papers
		// over by pretending, and not one the caller should discover as a
		// reverted transaction.
		if req.Chain == "SOLANA" {
			return unprocessable(c, "UNSUPPORTED_ON_CHAIN",
				"blacklisting is not supported on Solana: the usdx_bridge program has no blacklist; it is an Ethereum USDX capability")
		}
	}

	client, ok := h.router.Enforcer(req.Chain)
	if !ok {
		return unprocessable(c, "UNSUPPORTED_ON_CHAIN",
			fmt.Sprintf("chain %q is not configured for enforcement", req.Chain))
	}

	// Pausing halts the bridge for everybody, so the relayer had better be
	// allowed to do it — checked by reading the chain before spending gas on
	// a transaction that would revert.
	if req.Action == enforcementActionPause || req.Action == enforcementActionUnpause {
		authority, err := client.IsPauseAuthority(c.Context())
		if err != nil {
			// Cannot determine: fail closed, and let the caller retry — this
			// is indistinguishable from an RPC blip.
			return platform.WriteError(c, fiber.StatusBadGateway, "CHAIN_UNAVAILABLE",
				"could not verify the pause authority on "+req.Chain+": "+err.Error())
		}
		if !authority {
			return unprocessable(c, "NOT_CHAIN_ADMIN",
				fmt.Sprintf("the configured %s signer is not the pause authority on this chain "+
					"(Ethereum: it lacks PAUSER_ROLE; Solana: it is not the BridgeConfig admin), "+
					"so a %s would revert — grant the role or rotate the signer first", req.Chain, req.Action))
		}
	}

	// The dedupe, before anything is submitted: whatever this reference has
	// already done is the answer, not a second submission.
	existing, err := h.repo.ChainEnforcementByReference(c.Context(), req.Reference)
	switch {
	case err == nil:
		return h.renderStoredEnforcement(c, existing)
	case !errors.Is(err, gorm.ErrRecordNotFound):
		return fail(c, err)
	}

	// Record first, submit second. A crash or timeout between the two leaves
	// a SUBMITTED row with no hash — retried requests see the row and do not
	// resubmit, and the age guard in renderStoredEnforcement turns it FAILED
	// with a reason that says to check the chain.
	row := &ledger.ChainEnforcement{
		Reference:   req.Reference,
		Action:      req.Action,
		Chain:       req.Chain,
		Address:     req.Address,
		Status:      string(ledger.EnforcementSubmitted),
		RequestedBy: actor(c),
		OnBehalfOf:  serviceActor(c),
		NextCheckAt: time.Now().UTC(),
	}
	if err := h.repo.CreateChainEnforcement(c.Context(), row); err != nil {
		return fail(c, err)
	}

	txHash, err := h.submit(c, client, req)
	if err != nil {
		switch bridge.Classify(err) {
		case bridge.ClassTerminal, bridge.ClassRefused:
			// The chain said no, deterministically. The row records it; the
			// 409 carries it.
			reason := err.Error()
			if ferr := h.repo.FailChainEnforcement(c.Context(), req.Reference, reason); ferr != nil {
				h.logger.Error("could not record an enforcement submission failure", "reference", req.Reference, "error", ferr)
			}
			return platform.WriteError(c, fiber.StatusConflict, "CHAIN_REJECTED", reason)
		case bridge.ClassAlreadyProcessed:
			// The chain's replay guard says an earlier transaction already
			// applied this action. Nothing here has a hash for it, so the row
			// is failed with exactly that statement rather than resubmitted.
			reason := "the chain reports an earlier transaction already applied this action: " + err.Error()
			if ferr := h.repo.FailChainEnforcement(c.Context(), req.Reference, reason); ferr != nil {
				h.logger.Error("could not record an enforcement submission failure", "reference", req.Reference, "error", ferr)
			}
			return platform.WriteError(c, fiber.StatusConflict, "ALREADY_PROCESSED", reason)
		default:
			// Transient, and no hash was ever obtained: the only state in
			// which a resubmission is safe. Delete the row so the caller's
			// retry starts clean.
			if derr := h.repo.DeleteChainEnforcement(c.Context(), req.Reference); derr != nil {
				h.logger.Error("could not release a failed enforcement submission", "reference", req.Reference, "error", derr)
			}
			return platform.WriteError(c, fiber.StatusBadGateway, "CHAIN_UNAVAILABLE",
				"the submission did not produce a transaction hash; retry under the same reference: "+err.Error())
		}
	}

	// The hash is the point of no return. Storing it keeps the row's state
	// honest; if the store fails, the row stays SUBMITTED with no hash and
	// the age guard fails it later — never resubmitted.
	if err := h.repo.StoreChainEnforcementTxHash(c.Context(), req.Reference, txHash); err != nil {
		h.logger.Error("submitted an enforcement transaction but could not record its hash",
			"reference", req.Reference, "tx_hash", txHash, "error", err)
		return platform.WriteError(c, fiber.StatusBadGateway, "AUDIT_WRITE_FAILED",
			"the enforcement transaction was submitted but its hash could not be recorded; retrying this request will not resubmit it")
	}

	if err := h.auditEnforcement(c, req, txHash); err != nil {
		// The row is the durable record; the audit event is best-effort
		// evidence of who submitted. A failed enqueue must not masquerade as
		// a failed submission.
		h.logger.Error("could not audit an enforcement submission", "reference", req.Reference, "error", err)
	}

	return c.Status(fiber.StatusAccepted).JSON(fiber.Map{
		"reference": req.Reference,
		"status":    string(ledger.EnforcementSubmitted),
		"tx_hash":   txHash,
		"action":    req.Action,
		"chain":     req.Chain,
		"address":   req.Address,
	})
}

// renderStoredEnforcement answers a retried request from the row: FINAL and
// FAILED are 200 (the outcome is known), SUBMITTED is 202 (still in flight).
// Nothing is ever submitted on this path.
func (h *Handlers) renderStoredEnforcement(c *fiber.Ctx, row *ledger.ChainEnforcement) error {
	// A SUBMITTED row that never got a hash means the original submission was
	// cut off between broadcasting and recording. The chain may or may not
	// hold the transaction, so the row is failed with a reason that sends a
	// human to the chain — resubmitting under this reference is forbidden by
	// the rule at the top of this file.
	if row.Status == string(ledger.EnforcementSubmitted) && row.TxHash == "" &&
		time.Since(row.CreatedAt) > staleSubmittedAge {
		reason := "the submission outcome is unknown: no transaction hash was recorded before the " +
			"request failed; check the chain for this reference before anything else"
		if err := h.repo.FailChainEnforcement(c.Context(), row.Reference, reason); err != nil {
			h.logger.Error("could not fail a stale enforcement row", "reference", row.Reference, "error", err)
		}
		row.Status = string(ledger.EnforcementFailed)
		row.FailureReason = reason
	}

	status := fiber.StatusAccepted
	if row.Status == string(ledger.EnforcementFinal) || row.Status == string(ledger.EnforcementFailed) {
		status = fiber.StatusOK
	}
	return c.Status(status).JSON(fiber.Map{
		"reference":      row.Reference,
		"status":         row.Status,
		"tx_hash":        row.TxHash,
		"failure_reason": row.FailureReason,
		"action":         row.Action,
		"chain":          row.Chain,
		"address":        row.Address,
	})
}

// getEnforcement is the poll endpoint compliance (and the e2e harness, via
// the gateway's proxy of compliance) can ask for one action's stored state.
func (h *Handlers) getEnforcement(c *fiber.Ctx) error {
	row, err := h.repo.ChainEnforcementByReference(c.Context(), c.Params("reference"))
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return platform.WriteError(c, fiber.StatusNotFound, "NOT_FOUND", "no enforcement submission recorded for this reference")
	}
	if err != nil {
		return fail(c, err)
	}
	return c.JSON(fiber.Map{
		"reference":      row.Reference,
		"status":         row.Status,
		"tx_hash":        row.TxHash,
		"failure_reason": row.FailureReason,
		"action":         row.Action,
		"chain":          row.Chain,
		"address":        row.Address,
		"attempts":       row.Attempts,
		"created_at":     row.CreatedAt.UTC().Format(time.RFC3339),
		"updated_at":     row.UpdatedAt.UTC().Format(time.RFC3339),
	})
}

// submit builds and broadcasts the transaction for one validated action. The
// reference travels to the signer as the correlation id, so a remote signer's
// idempotency and re-sign caps apply to the same authorisation.
func (h *Handlers) submit(c *fiber.Ctx, client bridge.EnforcementClient, req enforcementRequest) (string, error) {
	switch req.Action {
	case enforcementActionBlacklist:
		return client.Blacklist(req.Address, req.Reference)
	case enforcementActionUnblacklist:
		return client.Unblacklist(req.Address, req.Reference)
	case enforcementActionPause:
		return client.Pause(req.Reference)
	case enforcementActionUnpause:
		return client.Unpause(req.Reference)
	default:
		return "", fmt.Errorf("unvalidated action %q reached submission", req.Action)
	}
}

// auditEnforcement records the submission on the same outbox every
// core-ledger action is audited through. The actor is the caller's X-User-Id
// (the compliance service acting for its approval), with the authenticated
// client recorded as the on-behalf-of — the route's whole point is that a
// service token, not a human, holds the keys, and the trail must say both.
func (h *Handlers) auditEnforcement(c *fiber.Ctx, req enforcementRequest, txHash string) error {
	return h.repo.EnqueueAuditEvent(c.Context(), audit.Event{
		Actor:       actor(c),
		OnBehalfOf:  serviceActor(c),
		Action:      "ledger.chain.enforcement_submitted",
		SubjectType: "ENFORCEMENT_ACTION",
		SubjectID:   req.Reference,
		Outcome:     audit.OutcomeSuccess,
		AfterState:  map[string]any{"status": "SUBMITTED", "tx_hash": txHash},
		Metadata: map[string]any{
			"action":  req.Action,
			"chain":   req.Chain,
			"address": req.Address,
			"tx_hash": txHash,
		},
	})
}

// serviceActor is the authenticated client identity (service:<azp>), or the
// empty string when the auth middleware did not run (handler tests).
func serviceActor(c *fiber.Ctx) string {
	client, _ := c.Locals(authClientLocalsKey).(string)
	if client == "" {
		return ""
	}
	return "service:" + client
}

// unprocessable is the 422 half of validation: the request is well-formed but
// asks for something the chain cannot do, with a code the caller can act on.
func unprocessable(c *fiber.Ctx, code, msg string) error {
	return platform.WriteError(c, fiber.StatusUnprocessableEntity, code, msg)
}
