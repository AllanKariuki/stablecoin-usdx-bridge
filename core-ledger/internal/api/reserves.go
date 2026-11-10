package api

import (
	"math/big"
	"time"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/ledger"

	"github.com/gofiber/fiber/v2"
)

// The reserve surface: the writers the three snapshot tables never had, and
// the read surface a treasury dashboard is built on.
//
// These are service-to-service routes. services/indexer posts chain supply and
// services/rms posts what the custodian says, both from inside the cluster —
// they are not exposed through the gateway's route table, because a
// reconciliation *input* reachable from the internet is a way to make the peg
// look healthy while it isn't.

func (h *Handlers) registerReserves(app *fiber.App) {
	app.Post("/reserves/chain-supply-snapshots", h.idempotent, h.postChainSupplySnapshot)
	app.Post("/reserves/custodian-snapshots", h.idempotent, h.postCustodianSnapshot)

	app.Get("/reserves/status", h.reserveStatus)
	app.Get("/reserves/reconciliation-runs", h.listReconciliationRuns)
	app.Get("/reserves/reconciliation-runs/:runId", h.getReconciliationRun)
	app.Get("/reserves/reconciliation-breaks", h.listReconciliationBreaks)
}

// postChainSupplySnapshot records what a chain's total supply was at a height.
//
// Amounts arrive as decimal strings at the currency's own scale, like every
// other amount this API accepts — a total supply of "250.00" USD-X is
// 250000000 base units, and a consumer that guesses the scale is off by 10^6.
func (h *Handlers) postChainSupplySnapshot(c *fiber.Ctx) error {
	var req struct {
		Chain       string               `json:"chain"`
		Height      uint64               `json:"height"`
		BlockHash   string               `json:"block_hash"`
		TotalSupply ledger.DecimalAmount `json:"total_supply"`
		Source      string               `json:"source"`
		CapturedAt  string               `json:"captured_at"`
	}
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	usdx, err := h.repo.Currency(c.Context(), ledger.USDXCode)
	if err != nil {
		return fail(c, err)
	}
	supply, err := req.TotalSupply.In(usdx)
	if err != nil {
		return badRequest(c, err.Error())
	}
	capturedAt, err := parseOptionalTime(req.CapturedAt)
	if err != nil {
		return badRequest(c, "captured_at must be RFC3339")
	}

	err = h.repo.SaveChainSupplySnapshot(c.Context(), ledger.ChainSupplySnapshot{
		Chain:       req.Chain,
		Height:      req.Height,
		BlockHash:   req.BlockHash,
		TotalSupply: supply,
		Source:      defaultString(req.Source, actor(c)),
		CapturedAt:  capturedAt,
	})
	if err != nil {
		return fail(c, err)
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"chain":        req.Chain,
		"height":       req.Height,
		"total_supply": ledger.FormatDecimal(supply, usdx.Decimals),
	})
}

// postCustodianSnapshot is the call that unblocks Leg C.
//
// Leg C has been skipped on every reconciliation run this platform has ever
// performed, because trust_bank_snapshot's only documented writer was a "Bank
// Adapter service (not part of this repo)" that does not exist. services/rms
// is that writer.
func (h *Handlers) postCustodianSnapshot(c *fiber.Ctx) error {
	var req struct {
		CustodianID  string               `json:"custodian_id"`
		Currency     string               `json:"currency"`
		Balance      ledger.DecimalAmount `json:"balance"`
		AsOf         string               `json:"as_of"`
		Source       string               `json:"source"`
		StatementRef string               `json:"statement_ref"`
	}
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	code := defaultString(req.Currency, ledger.PegCurrency)
	cur, err := h.repo.Currency(c.Context(), code)
	if err != nil {
		return fail(c, err)
	}
	balance, err := req.Balance.In(cur)
	if err != nil {
		return badRequest(c, err.Error())
	}
	asOf, err := parseOptionalTime(req.AsOf)
	if err != nil {
		return badRequest(c, "as_of must be RFC3339")
	}

	err = h.repo.SaveCustodianSnapshot(c.Context(), ledger.CustodianSnapshot{
		CustodianID:  req.CustodianID,
		Currency:     code,
		Balance:      balance,
		AsOf:         asOf,
		Source:       defaultString(req.Source, actor(c)),
		StatementRef: req.StatementRef,
	})
	if err != nil {
		return fail(c, err)
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"custodian_id": defaultString(req.CustodianID, "primary"),
		"currency":     code,
		"balance":      ledger.FormatDecimal(balance, cur.Decimals),
		"as_of":        asOf.UTC().Format(time.RFC3339),
	})
}

// reserveStatus is the treasury dashboard in one call: the five numbers the
// three legs compare, each at its own scale, plus whatever is currently
// broken. A dashboard assembling this from six endpoints would show five of
// them consistent and one from a different moment.
func (h *Handlers) reserveStatus(c *fiber.Ctx) error {
	usdx, err := h.repo.Currency(c.Context(), ledger.USDXCode)
	if err != nil {
		return fail(c, err)
	}
	peg, err := h.repo.Currency(c.Context(), ledger.PegCurrency)
	if err != nil {
		return fail(c, err)
	}

	read := func(glCode string) (*big.Int, error) { return h.repo.BalanceByGLCode(c.Context(), glCode) }
	issued, err := read(ledger.GLCirculation)
	if err != nil {
		return fail(c, err)
	}
	inTransit, err := read(ledger.GLBridgeSuspense)
	if err != nil {
		return fail(c, err)
	}
	backing, err := read(ledger.GLReserveBacking(ledger.PegCurrency))
	if err != nil {
		return fail(c, err)
	}
	ledgerCash, err := read(ledger.GLTrustBank(ledger.PegCurrency))
	if err != nil {
		return fail(c, err)
	}

	out := fiber.Map{
		"issued":      ledger.FormatDecimal(issued, usdx.Decimals),
		"in_transit":  ledger.FormatDecimal(inTransit, usdx.Decimals),
		"backing":     ledger.FormatDecimal(backing, peg.Decimals),
		"ledger_cash": ledger.FormatDecimal(ledgerCash, peg.Decimals),
		"currency":    peg.Code,
	}

	chains := fiber.Map{}
	for _, chain := range []string{"ETHEREUM", "SOLANA"} {
		supply, height, capturedAt, err := h.repo.LatestChainSupply(c.Context(), chain)
		if err != nil {
			// No snapshot is a state worth rendering, not an error: it means
			// the indexer has not reported this chain yet, and a dashboard
			// showing a blank is more honest than one showing a zero.
			chains[chain] = fiber.Map{"total_supply": nil, "height": nil, "captured_at": nil}
			continue
		}
		chains[chain] = fiber.Map{
			"total_supply": ledger.FormatDecimal(supply, usdx.Decimals),
			"height":       height,
			"captured_at":  capturedAt.UTC().Format(time.RFC3339),
			"age_seconds":  int64(time.Since(capturedAt).Seconds()),
		}
	}
	out["chains"] = chains

	if balance, asOf, err := h.repo.CustodianBalance(c.Context(), ledger.PegCurrency); err == nil {
		out["custodian"] = fiber.Map{
			"balance":     ledger.FormatDecimal(balance, peg.Decimals),
			"as_of":       asOf.UTC().Format(time.RFC3339),
			"age_seconds": int64(time.Since(asOf).Seconds()),
		}
	} else {
		out["custodian"] = nil
	}

	breaks, err := h.repo.OpenBreaks(c.Context())
	if err != nil {
		return fail(c, err)
	}
	out["open_breaks"] = renderBreaks(breaks)

	if runs, err := h.repo.ReconciliationRuns(c.Context(), 1); err == nil && len(runs) > 0 {
		out["last_run"] = renderRun(&runs[0])
	} else {
		out["last_run"] = nil
	}
	return c.JSON(out)
}

func (h *Handlers) listReconciliationRuns(c *fiber.Ctx) error {
	runs, err := h.repo.ReconciliationRuns(c.Context(), clampLimit(c.QueryInt("limit"), 50, 200))
	if err != nil {
		return fail(c, err)
	}
	out := make([]fiber.Map, 0, len(runs))
	for i := range runs {
		out = append(out, renderRun(&runs[i]))
	}
	return c.JSON(fiber.Map{"runs": out})
}

func (h *Handlers) getReconciliationRun(c *fiber.Ctx) error {
	run, err := h.repo.ReconciliationRun(c.Context(), c.Params("runId"))
	if err != nil {
		return fail(c, err)
	}
	breaks, err := h.repo.BreaksForRun(c.Context(), run.ID)
	if err != nil {
		return fail(c, err)
	}
	out := renderRun(run)
	out["breaks"] = renderBreaks(breaks)
	return c.JSON(out)
}

func (h *Handlers) listReconciliationBreaks(c *fiber.Ctx) error {
	breaks, err := h.repo.OpenBreaks(c.Context())
	if err != nil {
		return fail(c, err)
	}
	return c.JSON(fiber.Map{"breaks": renderBreaks(breaks)})
}

// ---------------------------------------------------------------------------

func renderRun(r *ledger.ReconciliationRun) fiber.Map {
	out := fiber.Map{
		"id":           r.ID,
		"status":       r.Status,
		"started_at":   r.StartedAt.UTC().Format(time.RFC3339),
		"break_count":  r.BreakCount,
		"triggered_by": r.TriggeredBy,
		"error":        r.Error,
		// Explicitly three-valued. null is "this leg was not evaluated",
		// which is not the same as false and must never render as green.
		"leg_a_ok": r.LegAOK,
		"leg_b_ok": r.LegBOK,
		"leg_c_ok": r.LegCOK,
		// Raw smallest units, as strings. A run row is forensic evidence; it
		// is deliberately not re-scaled for display here, because the scale a
		// figure was compared at is part of what is being evidenced.
		"issued":       bigString(r.Issued),
		"in_transit":   bigString(r.InTransit),
		"eth_supply":   bigString(r.EthSupply),
		"sol_supply":   bigString(r.SolSupply),
		"backing":      bigString(r.Backing),
		"ledger_cash":  bigString(r.LedgerCash),
		"bank_balance": bigString(r.BankBalance),
	}
	if r.FinishedAt != nil {
		out["finished_at"] = r.FinishedAt.UTC().Format(time.RFC3339)
		out["duration_ms"] = r.FinishedAt.Sub(r.StartedAt).Milliseconds()
	}
	if r.BankAsOf != nil {
		out["bank_as_of"] = r.BankAsOf.UTC().Format(time.RFC3339)
	}
	return out
}

func renderBreaks(breaks []ledger.ReconciliationBreak) []fiber.Map {
	out := make([]fiber.Map, 0, len(breaks))
	for _, b := range breaks {
		row := fiber.Map{
			"id":           b.ID,
			"leg":          b.Leg,
			"code":         b.Code,
			"detail":       b.Detail,
			"drift":        bigString(b.Drift),
			"first_drift":  bigString(b.FirstDrift),
			"opened_at":    b.OpenedAt.UTC().Format(time.RFC3339),
			"last_seen_at": b.LastSeenAt.UTC().Format(time.RFC3339),
			"observations": b.Observations,
			"open_seconds": int64(time.Since(b.OpenedAt).Seconds()),
		}
		if b.ResolvedAt != nil {
			row["resolved_at"] = b.ResolvedAt.UTC().Format(time.RFC3339)
			row["open_seconds"] = int64(b.ResolvedAt.Sub(b.OpenedAt).Seconds())
		}
		out = append(out, row)
	}
	return out
}

func bigString(v *big.Int) any {
	if v == nil {
		return nil
	}
	return v.String()
}

func parseOptionalTime(s string) (time.Time, error) {
	if s == "" {
		return time.Time{}, nil
	}
	return time.Parse(time.RFC3339, s)
}

func defaultString(v, fallback string) string {
	if v == "" {
		return fallback
	}
	return v
}
