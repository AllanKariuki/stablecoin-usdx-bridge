// Package authztable maps an inbound request (method + path) to the set of
// permissions that authorize it, using shared/authz's generated role→
// permission expansion as the source of truth for what each permission
// means.
//
// A route rule lists every permission that's *sufficient* on its own — not
// every permission required — because the gateway can't see resource
// ownership (whether wallet :walletId belongs to the caller). It only knows
// "does this caller hold wallets:read:own or wallets:read:any". The actual
// own-vs-any enforcement happens downstream, in the service that can see
// the resource (core-ledger/BFF), using the X-User-Id this proxy sets.
package authztable

import (
	"regexp"
	"strings"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/shared/authz/generated"
)

// Rule is one route→permission mapping. Path uses Fiber-style :param
// segments, translated to a regexp at build time.
type Rule struct {
	Method     string
	Path       string
	AnyOf      []authz.Permission
	pathRegexp *regexp.Regexp
}

// Table is an ordered list of rules, matched first-to-last so a more
// specific rule can precede a catch-all.
type Table []*Rule

var paramSegment = regexp.MustCompile(`:[^/]+`)

// compile turns a Fiber-style path ("/wallets/:walletId") into a regexp
// matching any value in the :param position. Path segments here are fixed,
// developer-authored strings (not user input), so building the regexp by
// substitution before quoting — rather than quoting first, which would also
// escape the ':' this substitution looks for — is safe.
func compile(method, path string, anyOf ...authz.Permission) *Rule {
	return &Rule{
		Method:     method,
		Path:       path,
		AnyOf:      anyOf,
		pathRegexp: regexp.MustCompile("^" + paramSegment.ReplaceAllString(path, `[^/]+`) + "$"),
	}
}

// Match returns the rule authorizing method+path, and whether one was
// found. A path with no matching rule is denied by default — see
// DefaultDeny in the handler package.
func (t Table) Match(method, path string) (*Rule, bool) {
	method = strings.ToUpper(method)
	for _, r := range t {
		if r.Method != method {
			continue
		}
		if r.pathRegexp.MatchString(path) {
			return r, true
		}
	}
	return nil, false
}

// Allows reports whether permissions (already expanded from the caller's
// roles) satisfies rule — holding any one of AnyOf is sufficient.
func (r *Rule) Allows(permissions []authz.Permission) bool {
	granted := make(map[authz.Permission]bool, len(permissions))
	for _, p := range permissions {
		granted[p] = true
	}
	for _, need := range r.AnyOf {
		if granted[need] {
			return true
		}
	}
	return false
}

// Default is the platform's known route surface as of P1: services/bff's
// own routes (see services/bff/src/*/*.controller.ts), which is what the
// gateway actually forwards to at :8082/api — not core-ledger's raw shapes.
// The two aren't identical: bff's GET /wallets (list the caller's own,
// no :userId param — see services/bff/src/wallets/wallets.controller.ts)
// replaces core-ledger's GET /users/:userId/wallets, and bff adds routes
// core-ledger has no equivalent of at all (GET /dashboard). Extend this
// table as later phases add services/routes; it is intentionally not
// derived from any service's own route registration, since the gateway
// must keep working even if a downstream service's internal routing
// changes shape.
var Default = Table{
	// Wallets
	compile("GET", "/wallets", authz.PermissionWalletsReadOwn, authz.PermissionWalletsReadAny),
	compile("GET", "/wallets/:walletId", authz.PermissionWalletsReadOwn, authz.PermissionWalletsReadAny),
	compile("GET", "/wallets/:walletId/statement", authz.PermissionWalletsReadOwn, authz.PermissionWalletsReadAny),
	compile("POST", "/wallets/:walletId/status", authz.PermissionWalletsStatusManage),

	// Dashboard (bff-only aggregation, no core-ledger equivalent)
	compile("GET", "/dashboard", authz.PermissionWalletsReadOwn, authz.PermissionWalletsReadAny),

	// Money movement
	compile("POST", "/deposits", authz.PermissionWalletsWriteOwn, authz.PermissionWalletsWriteAny),
	compile("POST", "/withdrawals", authz.PermissionWalletsWriteOwn, authz.PermissionWalletsWriteAny),
	compile("POST", "/transfers", authz.PermissionWalletsWriteOwn, authz.PermissionWalletsWriteAny),
	compile("POST", "/fx/quotes", authz.PermissionFxQuote),
	compile("POST", "/fx/conversions", authz.PermissionFxConvert),
	compile("POST", "/issuances", authz.PermissionIssuanceCreate),
	compile("POST", "/redemptions", authz.PermissionRedemptionCreate),
	compile("POST", "/redemptions/:transactionId/confirm", authz.PermissionLedgerAdmin), // break-glass operator path, see P2
	compile("POST", "/bridges", authz.PermissionBridgeCreate),

	// Journal / ledger
	compile("GET", "/transactions", authz.PermissionTransactionsReadOwn, authz.PermissionTransactionsReadAny),
	compile("GET", "/transactions/:transactionId", authz.PermissionTransactionsReadOwn, authz.PermissionTransactionsReadAny),
	compile("POST", "/transactions/:transactionId/reversal", authz.PermissionTransactionsReverse),
	compile("GET", "/accounts", authz.PermissionLedgerRead),
	compile("GET", "/accounts/:glCode/balance", authz.PermissionLedgerRead),
	compile("GET", "/ledger/trial-balance", authz.PermissionLedgerRead),
	compile("GET", "/ledger/integrity", authz.PermissionLedgerRead),
	compile("POST", "/ledger/closures", authz.PermissionLedgerAdmin),
	compile("GET", "/transfers/:correlationId", authz.PermissionTransactionsReadOwn, authz.PermissionTransactionsReadAny),

	// Reserves & reconciliation (P3). Read-only through the gateway: the
	// *writers* (services/indexer's chain supply snapshots, services/rms's
	// custodian statements) are service-to-service calls inside the cluster
	// and deliberately have no rule here. A reconciliation input reachable
	// from the internet is a way to make the peg look healthy while it isn't.
	compile("GET", "/reserves/status", authz.PermissionReservesRead),
	compile("GET", "/reserves/reconciliation-runs", authz.PermissionReservesRead),
	compile("GET", "/reserves/reconciliation-runs/:runId", authz.PermissionReservesRead),
	compile("GET", "/reserves/reconciliation-breaks", authz.PermissionReservesRead),
	compile("GET", "/reserves/targets", authz.PermissionReservesRead),
	compile("GET", "/custodians", authz.PermissionReservesRead),
	compile("GET", "/custodians/:custodianId/statements", authz.PermissionReservesRead),
	compile("GET", "/attestations", authz.PermissionReservesRead),
	compile("GET", "/attestations/:attestationId", authz.PermissionReservesRead),

	// Treasury-only. Arming a custodian drift or editing a reserve target can
	// make a reconciliation break appear or disappear, which is why
	// reserves:manage is one of the permissions `admin` deliberately does not
	// hold — see shared/authz/permissions.yaml's segregation-of-duties note.
	compile("PUT", "/reserves/targets/:currency", authz.PermissionReservesManage),
	compile("POST", "/custodians/:custodianId/poll", authz.PermissionReservesManage),
	compile("POST", "/custodians/:custodianId/drift", authz.PermissionReservesManage),
	compile("POST", "/attestations", authz.PermissionReservesManage),
	compile("POST", "/attestations/:attestationId/publish", authz.PermissionReservesManage),

	// Payments (P4). services/payments, reached through bff's upstream proxy.
	//
	// Bank accounts read and write under the same wallets:write permissions a
	// deposit does, deliberately: registering an account you can withdraw to is
	// as consequential as moving money, and giving it a separate permission
	// would let a role hold one without the other.
	compile("GET", "/banks/available", authz.PermissionPaymentsReadOwn),
	compile("GET", "/banks/user-accounts", authz.PermissionPaymentsReadOwn),
	compile("GET", "/banks/linked-accounts", authz.PermissionPaymentsReadOwn),
	compile("GET", "/banks/beneficiaries", authz.PermissionPaymentsReadOwn),
	compile("POST", "/banks/register", authz.PermissionPaymentsWriteOwn),
	compile("POST", "/banks/link", authz.PermissionPaymentsWriteOwn),
	compile("POST", "/banks/beneficiaries", authz.PermissionPaymentsWriteOwn),
	compile("DELETE", "/banks/user-accounts/:accountId", authz.PermissionPaymentsWriteOwn),

	compile("GET", "/payment-intents", authz.PermissionPaymentsReadOwn, authz.PermissionPaymentsManageAny),
	compile("GET", "/payment-intents/:intentId", authz.PermissionPaymentsReadOwn, authz.PermissionPaymentsManageAny),
	compile("POST", "/payment-intents", authz.PermissionPaymentsWriteOwn),
	compile("POST", "/payment-intents/:intentId/cancel", authz.PermissionPaymentsWriteOwn),

	compile("GET", "/invoices", authz.PermissionPaymentsReadOwn, authz.PermissionPaymentsManageAny),
	compile("GET", "/invoices/:invoiceId", authz.PermissionPaymentsReadOwn, authz.PermissionPaymentsManageAny),
	compile("POST", "/invoices", authz.PermissionPaymentsWriteOwn),
	compile("POST", "/invoices/:invoiceId/void", authz.PermissionPaymentsWriteOwn),
	compile("POST", "/invoices/:invoiceId/pay", authz.PermissionPaymentsWriteOwn),

	// Notifications (P4).
	//
	// Two routes are deliberately absent and must stay absent:
	//
	//   - GET /invoices/pay/:token — a payment link is opened by somebody who
	//     is not logged in, and the token is the credential. It resolves at
	//     services/payments directly, not through the authenticated gateway.
	//   - POST /rails/:rail/callback — Safaricom does not hold a DAMP token.
	//     It reaches services/payments over its own ingress, never this one.
	//
	// A rule here for either would be a rule that could never be satisfied,
	// and adding one "for completeness" would break both flows.
	compile("GET", "/notifications", authz.PermissionNotificationsReadOwn),
	compile("POST", "/notifications/read-all", authz.PermissionNotificationsReadOwn),
	compile("POST", "/notifications/:notificationId/read", authz.PermissionNotificationsReadOwn),
	compile("GET", "/notification-preferences", authz.PermissionNotificationsReadOwn),
	compile("PUT", "/notification-preferences", authz.PermissionNotificationsReadOwn),

	compile("GET", "/webhooks", authz.PermissionNotificationsWebhooksManage),
	compile("POST", "/webhooks", authz.PermissionNotificationsWebhooksManage),
	compile("DELETE", "/webhooks/:webhookId", authz.PermissionNotificationsWebhooksManage),

	// Maker-checker (P5).
	//
	// Proposing and deciding are separate permissions because they are
	// separate acts: `auditor` holds propose and not decide, because
	// independent oversight that can approve is not independent.
	compile("GET", "/approval-policies", authz.PermissionApprovalsPropose, authz.PermissionApprovalsDecide),
	compile("GET", "/approval-requests", authz.PermissionApprovalsPropose, authz.PermissionApprovalsDecide),
	compile("GET", "/approval-requests/:requestId", authz.PermissionApprovalsPropose, authz.PermissionApprovalsDecide),
	compile("POST", "/approval-requests", authz.PermissionApprovalsPropose),
	compile("POST", "/approval-requests/:requestId/cancel", authz.PermissionApprovalsPropose),
	compile("POST", "/approval-requests/:requestId/approve", authz.PermissionApprovalsDecide),
	compile("POST", "/approval-requests/:requestId/reject", authz.PermissionApprovalsDecide),

	// KYC (P5). A customer submits their own; a compliance officer reviews
	// anyone's. The split between kyc:submit and kyc:review is what stops the
	// two being the same person.
	compile("GET", "/kyc/status", authz.PermissionKycSubmit),
	compile("GET", "/kyc/cases", authz.PermissionKycSubmit, authz.PermissionKycReview),
	compile("POST", "/kyc/cases", authz.PermissionKycSubmit),
	compile("POST", "/kyc/cases/:caseId/documents", authz.PermissionKycSubmit),
	compile("POST", "/kyc/cases/:caseId/documents/upload-url", authz.PermissionKycSubmit),
	compile("POST", "/kyc/cases/:caseId/submit", authz.PermissionKycSubmit),
	compile("GET", "/kyc/tiers", authz.PermissionKycSubmit, authz.PermissionKycReview),

	compile("GET", "/kyc/queue", authz.PermissionKycReview),
	compile("GET", "/kyc/cases/:caseId", authz.PermissionKycReview),
	compile("POST", "/kyc/cases/:caseId/review", authz.PermissionKycReview),
	compile("GET", "/kyc/parties/:partyId/tier", authz.PermissionKycReview, authz.PermissionComplianceCasesManage),

	// Compliance (P5).
	compile("GET", "/compliance/alerts", authz.PermissionComplianceCasesManage),
	compile("POST", "/compliance/alerts/:alertId/dismiss", authz.PermissionComplianceCasesManage),
	compile("GET", "/compliance/cases", authz.PermissionComplianceCasesManage),
	compile("GET", "/compliance/cases/:caseId", authz.PermissionComplianceCasesManage),
	compile("GET", "/compliance/cases/:caseId/sar", authz.PermissionComplianceCasesManage),
	compile("POST", "/compliance/cases/:caseId/notes", authz.PermissionComplianceCasesManage),
	compile("POST", "/compliance/cases/:caseId/assign", authz.PermissionComplianceCasesManage),
	compile("POST", "/compliance/cases/:caseId/close", authz.PermissionComplianceCasesManage),
	compile("POST", "/compliance/screenings", authz.PermissionComplianceCasesManage),

	// Blacklisting and pausing. A separate permission from case management,
	// because reading and investigating is a different act from freezing
	// somebody's tokens — and both still go through maker-checker.
	compile("GET", "/compliance/enforcement", authz.PermissionComplianceCasesManage),
	compile("POST", "/compliance/enforcement", authz.PermissionComplianceBlacklistManage),

	// Reporting (P7). Every report checks its own required_permission inside
	// the service as well — the definition names it, so adding a report that
	// exposes more than its siblings does not mean editing this table and
	// hoping somebody notices.
	compile("GET", "/reports", authz.PermissionReportsRead),
	compile("GET", "/reports/runs", authz.PermissionReportsRead),
	compile("GET", "/reports/runs/:runId", authz.PermissionReportsRead),
	compile("GET", "/reports/runs/:runId/export.csv", authz.PermissionReportsRead),
	compile("POST", "/reports/:definitionId/run", authz.PermissionReportsRead),

	// A Superset guest token. Deliberately NOT gated on reports:read: a
	// customer embedding their own payments dashboard holds payments:read:own
	// and nothing else, and the actual restriction is the row-level security
	// clause the token carries — which services/reporting derives from the
	// caller's full permission set and refuses to issue without.
	compile("POST", "/reports/dashboards/:dashboardId/guest-token",
		authz.PermissionReportsRead, authz.PermissionPaymentsReadOwn, authz.PermissionWalletsReadOwn),

	// Audit trail (P7). Read-only through the gateway; recording is
	// /internal/events, which services post to inside the cluster and which
	// has no rule here at all.
	compile("GET", "/audit/events", authz.PermissionAuditRead),
	compile("GET", "/audit/events/:eventId/proof", authz.PermissionAuditRead),
	compile("GET", "/audit/anchors", authz.PermissionAuditRead),
	compile("GET", "/audit/verify", authz.PermissionAuditRead),
}
