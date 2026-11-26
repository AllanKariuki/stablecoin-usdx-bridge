package api

import (
	"math/big"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/ledger"

	"github.com/gofiber/fiber/v2"
)

// The treasury surface: the house's custodial-crypto exposure, and the
// rebalance journal the treasury desk posts when it buys or sells crypto at
// a custodian.
//
// POST /treasury/rebalances is service-to-service — services/rms' treasury
// desk route — and is not exposed through the gateway's route table, because
// a rebalance posting moves the house's own position and no user-facing
// surface should ever produce one (same reasoning as the reserves writers).

func (h *Handlers) registerTreasury(app *fiber.App) {
	app.Get("/treasury/positions", h.treasuryPositions)
	app.Post("/treasury/rebalances", h.idempotent, h.treasuryRebalance)
}

// treasuryPositions is the exposure dashboard in one call: for each active
// custodial crypto currency, what customers are owed, what the custodian
// holds, and the gap between them. A negative net_exposure is the house
// short that currency — the position treasury's next rebalance closes.
func (h *Handlers) treasuryPositions(c *fiber.Ctx) error {
	currencies, err := h.repo.Currencies(c.Context())
	if err != nil {
		return fail(c, err)
	}

	out := make([]fiber.Map, 0, 3)
	for _, cur := range currencies {
		if !ledger.IsCustodialCrypto(cur.Code) {
			continue
		}
		liabilities, err := h.repo.SubtreeBalance(c.Context(), ledger.GLWalletParent(cur.Code))
		if err != nil {
			return fail(c, err)
		}
		holdings, err := h.repo.BalanceByGLCode(c.Context(), ledger.GLCryptoCustody(cur.Code))
		if err != nil {
			return fail(c, err)
		}
		fxPos, err := h.repo.BalanceByGLCode(c.Context(), ledger.GLFxPosition(cur.Code))
		if err != nil {
			return fail(c, err)
		}
		net := new(big.Int).Sub(holdings, liabilities)
		out = append(out, fiber.Map{
			"currency":             cur.Code,
			"decimals":             cur.Decimals,
			"customer_liabilities": ledger.FormatDecimal(liabilities, cur.Decimals),
			"custody_holdings":     ledger.FormatDecimal(holdings, cur.Decimals),
			"fx_position":          ledger.FormatDecimal(fxPos, cur.Decimals),
			"net_exposure":         ledger.FormatDecimal(net, cur.Decimals),
		})
	}
	return c.JSON(fiber.Map{"positions": out})
}

// treasuryRebalance posts the journal for one treasury desk trade. BUY moves
// crypto from the FX position into the custody account and pays fiat out of
// the trust bank; SELL is the mirror. services/rms (ledger.treasury) is the
// only caller — see auth.go.
func (h *Handlers) treasuryRebalance(c *fiber.Ctx) error {
	var req struct {
		Side         string               `json:"side"`
		Currency     string               `json:"currency"`
		Amount       ledger.DecimalAmount `json:"amount"`
		FiatCurrency string               `json:"fiat_currency"`
		FiatAmount   ledger.DecimalAmount `json:"fiat_amount"`
		CustodianRef string               `json:"custodian_ref"`
		Note         string               `json:"note"`
	}
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	key, err := idempotencyKey(c)
	if err != nil {
		return fail(c, err)
	}

	// Each amount parses at its own currency's scale: "1.5" BTC is 1.5e8
	// satoshi while "1300.00" KES is 130000 cents — the same per-account
	// scale discipline as manualJournal's lines.
	amount, err := h.decimalForCurrency(c, req.Currency, req.Amount)
	if err != nil {
		return err
	}
	fiatAmount, err := h.decimalForCurrency(c, req.FiatCurrency, req.FiatAmount)
	if err != nil {
		return err
	}

	tx, err := h.ledger.TreasuryRebalance(c.Context(), ledger.TreasuryRebalanceRequest{
		Side:           req.Side,
		Currency:       req.Currency,
		Amount:         amount,
		FiatCurrency:   req.FiatCurrency,
		FiatAmount:     fiatAmount,
		CustodianRef:   req.CustodianRef,
		Note:           req.Note,
		IdempotencyKey: key,
		InitiatedBy:    actor(c),
	})
	if err != nil {
		return fail(c, err)
	}
	return c.Status(fiber.StatusCreated).JSON(h.renderTransaction(c, tx))
}

// decimalForCurrency resolves a currency and parses a wire amount at its
// scale, mapping a parse failure to a 400 rather than the 500 an untyped
// error would become.
func (h *Handlers) decimalForCurrency(c *fiber.Ctx, code string, amount ledger.DecimalAmount) (*big.Int, error) {
	cur, err := h.repo.Currency(c.Context(), code)
	if err != nil {
		return nil, fail(c, err)
	}
	v, err := amount.In(cur)
	if err != nil {
		return nil, badRequest(c, err.Error())
	}
	return v, nil
}
