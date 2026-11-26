package ledger

import (
	"context"
	"time"
)

// Break-glass redemption confirmation, made maker-checker in H4.
//
// POST /redemptions/:id/confirm no longer settles anything: it records a
// proposal here and opens an approval request in services/workflow. The
// workflow decision callback then proves the burn on chain before settling.
// This table is the proposal's record — who asked, for what hash, what
// workflow decided — and the thing an operator (or the ops console) polls
// while the approval is in flight.
//
// Nothing here authorizes a settlement on its own. The callback re-verifies
// the decision (HMAC + digest + request id) and the burn before the ledger
// moves; a row saying APPROVED_VERIFIED is the *record* of that proof, not a
// substitute for it.

type BreakGlassStatus string

const (
	// BreakGlassPending means the approval is still open in services/workflow.
	BreakGlassPending BreakGlassStatus = "PENDING"
	// BreakGlassApprovedVerified means workflow approved and the burn was
	// verified on chain; the redemption has been settled.
	BreakGlassApprovedVerified BreakGlassStatus = "APPROVED_VERIFIED"
	// BreakGlassRejected means workflow refused the request (or it expired).
	BreakGlassRejected BreakGlassStatus = "REJECTED"
	// BreakGlassVerificationFailed means workflow approved but the burn did
	// not verify; nothing was settled and failure_reason says why.
	BreakGlassVerificationFailed BreakGlassStatus = "VERIFICATION_FAILED"
)

type BreakGlassRequest struct {
	ID                string    `gorm:"column:id;primaryKey"`
	TransactionID     string    `gorm:"column:transaction_id"`
	ChainTxHash       string    `gorm:"column:chain_tx_hash"`
	Reason            string    `gorm:"column:reason"`
	RequestedBy       string    `gorm:"column:requested_by"`
	WorkflowRequestID string    `gorm:"column:workflow_request_id"`
	Status            string    `gorm:"column:status"`
	FailureReason     string    `gorm:"column:failure_reason"`
	CreatedAt         time.Time `gorm:"column:created_at;autoCreateTime"`
	UpdatedAt         time.Time `gorm:"column:updated_at"`
}

// CreateBreakGlass records a proposal. The partial unique index on
// (transaction_id) WHERE status = 'PENDING' is what rejects a second proposal
// while one is awaiting approval — mapped to a PostingError so the API can
// answer 409 instead of 500.
func (r *Repository) CreateBreakGlass(ctx context.Context, bg *BreakGlassRequest) error {
	err := r.db.WithContext(ctx).Create(bg).Error
	if isUniqueViolation(err) {
		return postErr("BREAK_GLASS_PENDING",
			"a break-glass confirmation for redemption %s is already pending approval", bg.TransactionID)
	}
	return err
}

// BreakGlassByWorkflowRequest finds the proposal a workflow decision callback
// is about.
func (r *Repository) BreakGlassByWorkflowRequest(ctx context.Context, workflowRequestID string) (*BreakGlassRequest, error) {
	var bg BreakGlassRequest
	if err := r.db.WithContext(ctx).First(&bg, "workflow_request_id = ?", workflowRequestID).Error; err != nil {
		return nil, err
	}
	return &bg, nil
}

// LatestBreakGlass is the most recent proposal for a redemption — the row
// GET /redemptions/:id/break-glass renders.
func (r *Repository) LatestBreakGlass(ctx context.Context, transactionID string) (*BreakGlassRequest, error) {
	var bg BreakGlassRequest
	if err := r.db.WithContext(ctx).
		Where("transaction_id = ?", transactionID).
		Order("created_at DESC").
		First(&bg).Error; err != nil {
		return nil, err
	}
	return &bg, nil
}

// PendingBreakGlass reports whether the redemption has a proposal still
// awaiting approval.
func (r *Repository) PendingBreakGlass(ctx context.Context, transactionID string) (*BreakGlassRequest, error) {
	var bg BreakGlassRequest
	if err := r.db.WithContext(ctx).
		Where("transaction_id = ? AND status = ?", transactionID, string(BreakGlassPending)).
		First(&bg).Error; err != nil {
		return nil, err
	}
	return &bg, nil
}

// UpdateBreakGlassStatus records what a workflow decision (or a failed
// verification) did to the proposal.
func (r *Repository) UpdateBreakGlassStatus(ctx context.Context, id string, status BreakGlassStatus, failureReason string) error {
	return r.db.WithContext(ctx).Model(&BreakGlassRequest{}).
		Where("id = ?", id).
		Updates(map[string]any{
			"status":         string(status),
			"failure_reason": failureReason,
		}).Error
}
