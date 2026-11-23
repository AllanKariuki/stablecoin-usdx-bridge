package api

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/bridge"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/ledger"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/workflowclient"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/shared/go/platform"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
)

// breakGlassSubjectType is the subject type every break-glass proposal uses,
// so the callback can tell its own approvals from any other service's at a
// glance — the same role "KYC_CASE" plays for services/kyc.
const breakGlassSubjectType = "REDEMPTION"

// breakGlassPayload is the object the approver is agreeing to and the digest
// is computed over. The callback re-derives the *same* object from the saga
// row and the proposal row before acting, so an approval against anything
// else — an amount edited, a hash swapped — fails the digest check and is
// refused.
//
// Every value is a string, deliberately: amounts cross service boundaries as
// decimal strings everywhere on this platform, and the digest encoding then
// has no numeric representation to disagree about.
func breakGlassPayload(t *ledger.BridgeTransfer, chainTxHash, reason string) map[string]any {
	return map[string]any{
		"transaction_id": t.LedgerTxID,
		"chain_tx_hash":  chainTxHash,
		"reason":         reason,
		"correlation_id": t.CorrelationID,
		"chain":          t.SourceChain,
		"source_address": t.SourceAddress,
		"amount":         ledger.FormatDecimal(t.Amount, ledger.USDXDecimals),
	}
}

// workflowCallback is the body services/workflow posts to the callback route,
// signed with WORKFLOW_CALLBACK_SECRET (see workflowclient.VerifyCallback for
// the exact scheme, mirrored from kyc and compliance).
type workflowCallback struct {
	RequestID     string `json:"requestId"`
	Action        string `json:"action"`
	SubjectType   string `json:"subjectType"`
	SubjectID     string `json:"subjectId"`
	PayloadDigest string `json:"payloadDigest"`
	Status        string `json:"status"`
}

// approvalCallback receives workflow's decision on a break-glass proposal.
//
// Three independent checks stand between this route and a fiat release:
//
//  1. The HMAC says the callback really came from workflow (enforced here,
//     because auth.go's hmacPaths exemption is exactly that — an exemption
//     from the JWT check, not from authentication).
//  2. The request id must be the one this proposal recorded, and the digest
//     re-computed over the saga as it stands now must match what was
//     approved — a compromised workflow service can return "approved" for
//     whatever it likes, and this is what makes that harmless.
//  3. The burn itself must verify on chain: right contract or program, right
//     source, right amount, right correlation id, final.
//
// It answers 200 even when the decision is refused on its merits: workflow
// retries a non-2xx until its budget is spent, and a failed verification will
// never stop failing. An authentication failure is different and is 401. The
// route is idempotent on redelivery — a proposal row that is no longer
// PENDING has already been processed, whatever its status.
func (h *Handlers) approvalCallback(c *fiber.Ctx) error {
	var body workflowCallback
	if err := c.BodyParser(&body); err != nil {
		return badRequest(c, "invalid request body")
	}

	if !workflowclient.VerifyCallback(h.workflowCallbackSecret, c.Get(workflowclient.SignatureHeader),
		body.RequestID, body.SubjectType, body.SubjectID, body.PayloadDigest, body.Status) {
		return platform.WriteError(c, fiber.StatusUnauthorized, "UNAUTHENTICATED", "approval callback not authenticated")
	}

	if body.SubjectType != breakGlassSubjectType {
		return c.JSON(fiber.Map{"applied": false, "reason": "not a redemption break-glass approval"})
	}

	row, err := h.repo.BreakGlassByWorkflowRequest(c.Context(), body.RequestID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return c.JSON(fiber.Map{"applied": false, "reason": "no break-glass proposal recorded for this request"})
	}
	if err != nil {
		return fail(c, err)
	}

	// Bound to the proposal this ledger actually recorded. A genuine decision
	// for some other request, or a request id this ledger never saw, is not
	// ours.
	if row.TransactionID != body.SubjectID {
		h.logger.Error("REFUSING a break-glass approval: the callback's subject is not the proposal's redemption",
			slog.String("workflow_request_id", body.RequestID),
			slog.String("subject_id", body.SubjectID),
			slog.String("row_transaction_id", row.TransactionID))
		return c.JSON(fiber.Map{"applied": false, "reason": "subject id mismatch"})
	}

	// Redelivered callback (workflow's delivery is at-least-once): the
	// decision has already been applied, in whichever direction.
	if row.Status != string(ledger.BreakGlassPending) {
		return c.JSON(fiber.Map{"applied": false, "reason": fmt.Sprintf("already %s", row.Status)})
	}

	// A rejection (or an expiry) settles the proposal and moves nothing.
	if body.Status != "APPROVED" {
		reason := "workflow decision: " + body.Status
		if err := h.repo.UpdateBreakGlassStatus(c.Context(), row.ID, ledger.BreakGlassRejected, reason); err != nil {
			return fail(c, err)
		}
		h.logger.Info("break-glass approval refused",
			slog.String("transaction_id", row.TransactionID),
			slog.String("workflow_request_id", body.RequestID),
			slog.String("status", body.Status))
		return c.JSON(fiber.Map{"applied": true, "status": string(ledger.BreakGlassRejected)})
	}

	// Approved: re-derive the payload from the saga as it stands and compare
	// digests before anything moves.
	t, err := h.repo.TransferForLedgerTx(c.Context(), row.TransactionID)
	if err != nil {
		return fail(c, err)
	}
	expectedDigest := workflowclient.Digest(breakGlassPayload(t, row.ChainTxHash, row.Reason))
	if expectedDigest != body.PayloadDigest {
		h.logger.Error("REFUSING a break-glass approval: the approved payload does not match the redemption",
			slog.String("transaction_id", row.TransactionID),
			slog.String("workflow_request_id", body.RequestID))
		if err := h.repo.UpdateBreakGlassStatus(c.Context(), row.ID, ledger.BreakGlassVerificationFailed,
			"the approved payload does not match the recorded break-glass request"); err != nil {
			return fail(c, err)
		}
		return c.JSON(fiber.Map{"applied": false, "reason": "payload digest mismatch"})
	}

	// The burn must really have happened, or the fiat stays where it is.
	client, ok := h.router.For(t.SourceChain)
	if !ok {
		if err := h.repo.UpdateBreakGlassStatus(c.Context(), row.ID, ledger.BreakGlassVerificationFailed,
			fmt.Sprintf("unknown source_chain %q", t.SourceChain)); err != nil {
			return fail(c, err)
		}
		return c.JSON(fiber.Map{"applied": false, "reason": "unknown source chain"})
	}
	if err := client.VerifyBurn(c.Context(), row.ChainTxHash, t.SourceAddress, t.Amount, t.CorrelationID); err != nil {
		reason := describeBurnError(err)
		h.logger.Error("break-glass burn did not verify; the redemption is NOT settled",
			slog.String("transaction_id", row.TransactionID),
			slog.String("chain_tx_hash", row.ChainTxHash),
			slog.String("chain", t.SourceChain),
			slog.Any("error", err))
		if uerr := h.repo.UpdateBreakGlassStatus(c.Context(), row.ID, ledger.BreakGlassVerificationFailed, reason); uerr != nil {
			return fail(c, uerr)
		}
		return c.JSON(fiber.Map{"applied": false, "reason": reason})
	}

	// Proof in hand: settle the redemption and the saga, once.
	if err := h.settleBreakGlass(c.Context(), t, row); err != nil {
		// 5xx, so workflow retries the callback. settleBreakGlass is
		// idempotent (the settlement posting replays its key, the saga settle
		// is a status update), and the row still reads PENDING until the
		// status update below lands — so a retry after a crash re-proves the
		// burn and re-runs the same, already-deduplicated settlement.
		return fail(c, err)
	}
	if err := h.repo.UpdateBreakGlassStatus(c.Context(), row.ID, ledger.BreakGlassApprovedVerified, ""); err != nil {
		return fail(c, err)
	}

	h.logger.Info("break-glass redemption settled after approval and on-chain verification",
		slog.String("transaction_id", row.TransactionID),
		slog.String("chain_tx_hash", row.ChainTxHash),
		slog.String("approved_for", row.RequestedBy))
	return c.JSON(fiber.Map{"applied": true, "status": string(ledger.BreakGlassApprovedVerified)})
}

// settleBreakGlass is the old confirmRedemption body, now reachable only from
// approvalCallback after an approval and an on-chain verification. It is
// deliberately shared with nothing else: this is the only path that may
// settle a redemption by hand, and keeping it in one place is what stops a
// future caller from skipping one of the two proofs.
func (h *Handlers) settleBreakGlass(ctx context.Context, t *ledger.BridgeTransfer, row *ledger.BreakGlassRequest) error {
	if _, err := h.ledger.ConfirmRedemption(ctx, row.TransactionID, row.ChainTxHash, "", row.RequestedBy); err != nil {
		return err
	}
	// Settle the saga too, or the worker will submit the burn this route just
	// proved already done.
	if err := h.repo.RecordChainTx(ctx, t.CorrelationID, "source_tx_hash", row.ChainTxHash); err != nil {
		return err
	}
	return h.repo.SettleTransfer(ctx, t.CorrelationID, ledger.StatusCompleted,
		"settled by approved break-glass: "+row.Reason)
}

// getBreakGlass renders the latest proposal for a redemption, so the ops
// console and the e2e harness can poll a confirmation until it lands.
func (h *Handlers) getBreakGlass(c *fiber.Ctx) error {
	row, err := h.repo.LatestBreakGlass(c.Context(), c.Params("transactionId"))
	if err != nil {
		return fail(c, err)
	}
	return c.JSON(renderBreakGlass(row))
}

func renderBreakGlass(row *ledger.BreakGlassRequest) fiber.Map {
	return fiber.Map{
		"transaction_id":      row.TransactionID,
		"chain_tx_hash":       row.ChainTxHash,
		"reason":              row.Reason,
		"requested_by":        row.RequestedBy,
		"workflow_request_id": row.WorkflowRequestID,
		"status":              row.Status,
		"failure_reason":      row.FailureReason,
		"created_at":          row.CreatedAt.UTC().Format(time.RFC3339),
		"updated_at":          row.UpdatedAt.UTC().Format(time.RFC3339),
	}
}

// describeBurnError turns VerifyBurn's typed outcomes into the readable,
// durable reason stored on the proposal row — the operator looking at a
// VERIFICATION_FAILED row should not have to read chain-client error text.
func describeBurnError(err error) string {
	var mismatch *bridge.ErrBurnMismatch
	switch {
	case errors.As(err, &mismatch):
		return fmt.Sprintf("on-chain burn does not match the proposal: %s", mismatch.Field)
	case errors.Is(err, bridge.ErrBurnNotFound):
		return "no such burn found on chain"
	case errors.Is(err, bridge.ErrBurnReverted):
		return "the burn transaction reverted on chain"
	case errors.Is(err, bridge.ErrBurnNotFinal):
		return "the burn is on chain but not final yet"
	default:
		return "burn verification failed: " + err.Error()
	}
}
