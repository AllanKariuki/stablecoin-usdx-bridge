package api

import (
	"errors"
	"math/big"
	"time"

	"core-ledger/internal/bridge"
	"core-ledger/internal/ledger"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Handlers struct {
	repo   *ledger.Repository
	ledger *ledger.Service
	saga   *bridge.Saga
}

func NewHandlers(repo *ledger.Repository, svc *ledger.Service, saga *bridge.Saga) *Handlers {
	return &Handlers{repo: repo, ledger: svc, saga: saga}
}

func (h *Handlers) Register(app *fiber.App) {
	// Wallets
	app.Post("/wallets", h.createWallet)
	app.Get("/users/:userId/wallets", h.listWallets)
	app.Get("/wallets/:walletId", h.getWallet)
	app.Get("/wallets/:walletId/statement", h.getStatement)
	app.Post("/wallets/:walletId/status", h.setWalletStatus)

	// Money movement
	app.Post("/deposits", h.deposit)
	app.Post("/withdrawals", h.withdraw)
	app.Post("/transfers", h.transfer)
	app.Post("/fx/quotes", h.createQuote)
	app.Post("/fx/conversions", h.convert)
	app.Post("/issuances", h.issue)
	app.Post("/redemptions", h.redeem)
	app.Post("/redemptions/:transactionId/confirm", h.confirmRedemption)
	app.Post("/bridges", h.bridgeTransfer)

	// Journal
	app.Get("/transactions/:transactionId", h.getTransaction)
	app.Post("/transactions/:transactionId/reversal", h.reverseTransaction)
	app.Get("/accounts/:glCode/balance", h.accountBalance)
	app.Get("/ledger/trial-balance", h.trialBalance)
	app.Get("/ledger/integrity", h.integrity)
	app.Post("/ledger/closures", h.closePeriod)

	// Bridge saga state (pre-existing)
	app.Get("/transfers/:correlationId", h.getTransfer)
}

// ---------------------------------------------------------------------------
// Wallets
// ---------------------------------------------------------------------------

type createWalletRequest struct {
	UserID   string `json:"user_id"`
	Currency string `json:"currency"`
	Chain    string `json:"chain"`   // required for USD-X, empty for fiat
	Address  string `json:"address"` // on-chain address, USD-X only
	Label    string `json:"label"`
}

func (h *Handlers) createWallet(c *fiber.Ctx) error {
	var req createWalletRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	w, err := h.repo.EnsureWallet(c.Context(), req.UserID, req.Currency, req.Chain, req.Address, req.Label)
	if err != nil {
		return fail(c, err)
	}
	return c.Status(fiber.StatusCreated).JSON(h.renderWallet(c, w))
}

func (h *Handlers) listWallets(c *fiber.Ctx) error {
	ws, err := h.repo.WalletsOf(c.Context(), c.Params("userId"))
	if err != nil {
		return fail(c, err)
	}
	out := make([]fiber.Map, 0, len(ws))
	for i := range ws {
		out = append(out, h.renderWallet(c, &ws[i]))
	}
	return c.JSON(fiber.Map{"wallets": out})
}

func (h *Handlers) getWallet(c *fiber.Ctx) error {
	w, err := h.repo.Wallet(c.Context(), c.Params("walletId"))
	if err != nil {
		return fail(c, err)
	}
	return c.JSON(h.renderWallet(c, w))
}

func (h *Handlers) setWalletStatus(c *fiber.Ctx) error {
	var req struct {
		Status string `json:"status"`
	}
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	if err := h.repo.SetWalletStatus(c.Context(), c.Params("walletId"), ledger.WalletStatus(req.Status)); err != nil {
		return fail(c, err)
	}
	w, err := h.repo.Wallet(c.Context(), c.Params("walletId"))
	if err != nil {
		return fail(c, err)
	}
	return c.JSON(h.renderWallet(c, w))
}

func (h *Handlers) getStatement(c *fiber.Ctx) error {
	w, err := h.repo.Wallet(c.Context(), c.Params("walletId"))
	if err != nil {
		return fail(c, err)
	}
	cur, err := h.repo.Currency(c.Context(), w.Currency)
	if err != nil {
		return fail(c, err)
	}
	entries, err := h.repo.Statement(c.Context(), w.AccountID, time.Time{}, time.Time{}, c.QueryInt("limit", 100))
	if err != nil {
		return fail(c, err)
	}

	lines := make([]fiber.Map, 0, len(entries))
	for _, e := range entries {
		lines = append(lines, fiber.Map{
			"seq":             e.Seq,
			"transaction_id":  e.TransactionID,
			"direction":       e.Direction,
			"amount":          ledger.FormatDecimal(e.Amount, cur.Decimals),
			"running_balance": ledger.FormatDecimal(e.RunningBalance, cur.Decimals),
			"currency":        e.Currency,
			"value_date":      e.ValueDate.Format("2006-01-02"),
			"description":     e.Description,
		})
	}
	return c.JSON(fiber.Map{"wallet_id": w.ID, "currency": w.Currency, "entries": lines})
}

// ---------------------------------------------------------------------------
// Money movement
// ---------------------------------------------------------------------------

type walletAmountRequest struct {
	WalletID string               `json:"wallet_id"`
	Amount   ledger.DecimalAmount `json:"amount"`
	Ref      string               `json:"reference"`
}

func (h *Handlers) deposit(c *fiber.Ctx) error {
	var req walletAmountRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	key, err := idempotencyKey(c)
	if err != nil {
		return fail(c, err)
	}
	amount, err := h.amountForWallet(c, req.WalletID, req.Amount)
	if err != nil {
		return fail(c, err)
	}

	tx, err := h.ledger.Deposit(c.Context(), ledger.DepositRequest{
		WalletID:       req.WalletID,
		Amount:         amount,
		IdempotencyKey: key,
		BankRef:        req.Ref,
		InitiatedBy:    actor(c),
	})
	if err != nil {
		return fail(c, err)
	}
	return c.Status(fiber.StatusCreated).JSON(h.renderTransaction(c, tx))
}

func (h *Handlers) withdraw(c *fiber.Ctx) error {
	var req walletAmountRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	key, err := idempotencyKey(c)
	if err != nil {
		return fail(c, err)
	}
	amount, err := h.amountForWallet(c, req.WalletID, req.Amount)
	if err != nil {
		return fail(c, err)
	}

	tx, err := h.ledger.Withdraw(c.Context(), ledger.WithdrawRequest{
		WalletID:       req.WalletID,
		Amount:         amount,
		IdempotencyKey: key,
		BankRef:        req.Ref,
		InitiatedBy:    actor(c),
	})
	if err != nil {
		return fail(c, err)
	}
	return c.Status(fiber.StatusCreated).JSON(h.renderTransaction(c, tx))
}

func (h *Handlers) transfer(c *fiber.Ctx) error {
	var req struct {
		FromWalletID string               `json:"from_wallet_id"`
		ToWalletID   string               `json:"to_wallet_id"`
		Amount       ledger.DecimalAmount `json:"amount"`
		Reference    string               `json:"reference"`
	}
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	key, err := idempotencyKey(c)
	if err != nil {
		return fail(c, err)
	}
	amount, err := h.amountForWallet(c, req.FromWalletID, req.Amount)
	if err != nil {
		return fail(c, err)
	}

	tx, err := h.ledger.Transfer(c.Context(), ledger.TransferRequest{
		FromWalletID:   req.FromWalletID,
		ToWalletID:     req.ToWalletID,
		Amount:         amount,
		IdempotencyKey: key,
		Reference:      req.Reference,
		InitiatedBy:    actor(c),
	})
	if err != nil {
		return fail(c, err)
	}
	return c.Status(fiber.StatusCreated).JSON(h.renderTransaction(c, tx))
}

// createQuote records a rate. In production this is the Payment/FX service's
// job and this endpoint is the seam it writes through; keeping quotes in the
// ledger's own table is what lets a conversion be re-derived years later.
func (h *Handlers) createQuote(c *fiber.Ctx) error {
	var req struct {
		BaseCcy   string `json:"base_currency"`
		QuoteCcy  string `json:"quote_currency"`
		Rate      string `json:"rate"`
		SpreadBps int32  `json:"spread_bps"`
		Source    string `json:"source"`
		TTLSecs   int    `json:"ttl_seconds"`
	}
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	rate, err := ledger.ParseRate(req.Rate)
	if err != nil {
		return badRequest(c, err.Error())
	}
	if _, err := h.repo.Currency(c.Context(), req.BaseCcy); err != nil {
		return fail(c, err)
	}
	if _, err := h.repo.Currency(c.Context(), req.QuoteCcy); err != nil {
		return fail(c, err)
	}

	ttl := req.TTLSecs
	if ttl <= 0 {
		ttl = 300
	}
	now := time.Now().UTC()
	q := &ledger.FxQuote{
		ID:        uuid.New().String(),
		BaseCcy:   req.BaseCcy,
		QuoteCcy:  req.QuoteCcy,
		Rate:      rate,
		SpreadBps: req.SpreadBps,
		Source:    req.Source,
		QuotedAt:  now,
		ExpiresAt: now.Add(time.Duration(ttl) * time.Second),
	}
	if err := h.repo.SaveQuote(c.Context(), q); err != nil {
		return fail(c, err)
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"id":             q.ID,
		"base_currency":  q.BaseCcy,
		"quote_currency": q.QuoteCcy,
		"rate":           ledger.FormatRate(q.Rate),
		"spread_bps":     q.SpreadBps,
		"expires_at":     q.ExpiresAt,
	})
}

func (h *Handlers) convert(c *fiber.Ctx) error {
	var req struct {
		FromWalletID string               `json:"from_wallet_id"`
		ToWalletID   string               `json:"to_wallet_id"`
		Amount       ledger.DecimalAmount `json:"amount"`
		QuoteID      string               `json:"quote_id"`
	}
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	key, err := idempotencyKey(c)
	if err != nil {
		return fail(c, err)
	}
	amount, err := h.amountForWallet(c, req.FromWalletID, req.Amount)
	if err != nil {
		return fail(c, err)
	}

	tx, err := h.ledger.Convert(c.Context(), ledger.ConvertRequest{
		FromWalletID:   req.FromWalletID,
		ToWalletID:     req.ToWalletID,
		Amount:         amount,
		QuoteID:        req.QuoteID,
		IdempotencyKey: key,
		InitiatedBy:    actor(c),
	})
	if err != nil {
		return fail(c, err)
	}
	return c.Status(fiber.StatusCreated).JSON(h.renderTransaction(c, tx))
}

// issue turns a USD balance into USD-X. The journal entry lands synchronously;
// the on-chain mint runs as a saga and the tokens sit in the in-transit
// suspense account until it confirms. Poll GET /transfers/{correlation_id}.
func (h *Handlers) issue(c *fiber.Ctx) error {
	var req struct {
		FiatWalletID string               `json:"fiat_wallet_id"`
		USDXWalletID string               `json:"usdx_wallet_id"`
		Amount       ledger.DecimalAmount `json:"amount"`
	}
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	key, err := idempotencyKey(c)
	if err != nil {
		return fail(c, err)
	}
	amount, err := h.amountForWallet(c, req.FiatWalletID, req.Amount)
	if err != nil {
		return fail(c, err)
	}
	usdxWallet, err := h.repo.Wallet(c.Context(), req.USDXWalletID)
	if err != nil {
		return fail(c, err)
	}

	// The correlation id is derived from the idempotency key so that a retried
	// issuance re-enters the same saga instead of starting a second one.
	correlationID := deriveCorrelationID(key)

	tx, err := h.ledger.Issue(c.Context(), ledger.IssueRequest{
		FiatWalletID:   req.FiatWalletID,
		USDXWalletID:   req.USDXWalletID,
		Amount:         amount,
		IdempotencyKey: key,
		CorrelationID:  correlationID,
		InitiatedBy:    actor(c),
	})
	if err != nil {
		return fail(c, err)
	}

	usdxAmount, ok := new(big.Int).SetString(stringField(tx.Metadata, "usdx_amount"), 10)
	if !ok {
		return fail(c, errors.New("issuance transaction is missing its USD-X amount"))
	}

	transfer := &ledger.BridgeTransfer{
		CorrelationID:  correlationID,
		UserAddress:    usdxWallet.Address,
		Amount:         usdxAmount,
		SourceChain:    "", // fresh mint: nothing is burned
		TargetChain:    usdxWallet.Chain,
		Status:         ledger.StatusPending,
		UserID:         usdxWallet.UserID,
		TargetWalletID: usdxWallet.ID,
	}
	if err := h.repo.Insert(transfer); err != nil {
		return fail(c, err)
	}
	go h.saga.Execute(correlationID)

	out := h.renderTransaction(c, tx)
	out["correlation_id"] = correlationID
	return c.Status(fiber.StatusAccepted).JSON(out)
}

func (h *Handlers) redeem(c *fiber.Ctx) error {
	var req struct {
		USDXWalletID string               `json:"usdx_wallet_id"`
		FiatWalletID string               `json:"fiat_wallet_id"`
		Amount       ledger.DecimalAmount `json:"amount"`
	}
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	key, err := idempotencyKey(c)
	if err != nil {
		return fail(c, err)
	}
	amount, err := h.amountForWallet(c, req.USDXWalletID, req.Amount)
	if err != nil {
		return fail(c, err)
	}

	tx, err := h.ledger.Redeem(c.Context(), ledger.RedeemRequest{
		USDXWalletID:   req.USDXWalletID,
		FiatWalletID:   req.FiatWalletID,
		Amount:         amount,
		IdempotencyKey: key,
		InitiatedBy:    actor(c),
	})
	if err != nil {
		return fail(c, err)
	}
	return c.Status(fiber.StatusAccepted).JSON(h.renderTransaction(c, tx))
}

// confirmRedemption is called once the on-chain burn is final, releasing the
// user's fiat. It is separate from redeem on purpose: paying out before the
// burn settles would let a user who front-runs the chain spend twice.
func (h *Handlers) confirmRedemption(c *fiber.Ctx) error {
	var req struct {
		ChainTxHash string `json:"chain_tx_hash"`
	}
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	tx, err := h.ledger.ConfirmRedemption(c.Context(), c.Params("transactionId"), req.ChainTxHash, "", actor(c))
	if err != nil {
		return fail(c, err)
	}
	return c.JSON(h.renderTransaction(c, tx))
}

// bridgeTransfer moves a user's existing USD-X from one chain to the other.
// No supply is created or destroyed; the journal moves it wallet -> suspense
// -> wallet as the saga burns and re-mints.
func (h *Handlers) bridgeTransfer(c *fiber.Ctx) error {
	var req struct {
		FromWalletID string               `json:"from_wallet_id"`
		ToWalletID   string               `json:"to_wallet_id"`
		Amount       ledger.DecimalAmount `json:"amount"`
	}
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	key, err := idempotencyKey(c)
	if err != nil {
		return fail(c, err)
	}
	from, err := h.repo.Wallet(c.Context(), req.FromWalletID)
	if err != nil {
		return fail(c, err)
	}
	to, err := h.repo.Wallet(c.Context(), req.ToWalletID)
	if err != nil {
		return fail(c, err)
	}
	if from.Currency != ledger.USDXCode || to.Currency != ledger.USDXCode {
		return badRequest(c, "a bridge moves USD-X between chains; both wallets must hold USD-X")
	}
	if from.Chain == to.Chain {
		return badRequest(c, "source and destination wallets are on the same chain")
	}
	if from.UserID != to.UserID {
		return badRequest(c, "a bridge moves one user's own USD-X between their own wallets")
	}
	amount, err := h.amountForWallet(c, req.FromWalletID, req.Amount)
	if err != nil {
		return fail(c, err)
	}

	correlationID := deriveCorrelationID(key)
	transfer := &ledger.BridgeTransfer{
		CorrelationID:  correlationID,
		UserAddress:    to.Address,
		Amount:         amount,
		SourceChain:    from.Chain,
		TargetChain:    to.Chain,
		Status:         ledger.StatusPending,
		UserID:         from.UserID,
		SourceWalletID: from.ID,
		TargetWalletID: to.ID,
	}
	if err := h.repo.Insert(transfer); err != nil {
		return fail(c, err)
	}
	go h.saga.Execute(correlationID)

	return c.Status(fiber.StatusAccepted).JSON(fiber.Map{
		"correlation_id": correlationID,
		"status":         transfer.Status,
		"source_chain":   transfer.SourceChain,
		"target_chain":   transfer.TargetChain,
	})
}

// ---------------------------------------------------------------------------
// Journal
// ---------------------------------------------------------------------------

func (h *Handlers) getTransaction(c *fiber.Ctx) error {
	tx, err := h.repo.FindTransaction(c.Context(), c.Params("transactionId"))
	if err != nil {
		return fail(c, err)
	}
	return c.JSON(h.renderTransaction(c, tx))
}

func (h *Handlers) reverseTransaction(c *fiber.Ctx) error {
	var req struct {
		Reason string `json:"reason"`
	}
	_ = c.BodyParser(&req)

	rev, err := h.ledger.Repo().Reverse(c.Context(), c.Params("transactionId"), req.Reason, actor(c), c.Get("Idempotency-Key"))
	if err != nil {
		return fail(c, err)
	}
	return c.Status(fiber.StatusCreated).JSON(h.renderTransaction(c, rev))
}

func (h *Handlers) accountBalance(c *fiber.Ctx) error {
	acct, err := h.repo.AccountByGLCode(c.Context(), c.Params("glCode"))
	if err != nil {
		return fail(c, err)
	}
	bal, err := h.repo.Balance(c.Context(), acct.ID)
	if err != nil {
		return fail(c, err)
	}
	decimals := int32(0)
	if acct.Currency != "" {
		cur, err := h.repo.Currency(c.Context(), acct.Currency)
		if err != nil {
			return fail(c, err)
		}
		decimals = cur.Decimals
	}
	return c.JSON(fiber.Map{
		"gl_code":  acct.GLCode,
		"name":     acct.Name,
		"type":     acct.Type,
		"currency": acct.Currency,
		"balance":  ledger.FormatDecimal(bal, decimals),
	})
}

func (h *Handlers) trialBalance(c *fiber.Ctx) error {
	currency := c.Query("currency")
	if currency == "" {
		return badRequest(c, "currency query parameter is required")
	}
	cur, err := h.repo.Currency(c.Context(), currency)
	if err != nil {
		return fail(c, err)
	}
	tb, err := h.repo.TrialBalance(c.Context(), currency, time.Time{})
	if err != nil {
		return fail(c, err)
	}

	lines := make([]fiber.Map, 0, len(tb.Lines))
	for _, l := range tb.Lines {
		lines = append(lines, fiber.Map{
			"gl_code": l.GLCode,
			"name":    l.Name,
			"type":    l.Type,
			"debits":  ledger.FormatDecimal(l.Debits, cur.Decimals),
			"credits": ledger.FormatDecimal(l.Credits, cur.Decimals),
			"balance": ledger.FormatDecimal(l.Balance, cur.Decimals),
		})
	}
	return c.JSON(fiber.Map{
		"currency":      tb.Currency,
		"as_of":         tb.AsOf,
		"balanced":      tb.Balanced,
		"total_debits":  ledger.FormatDecimal(tb.TotalDebits, cur.Decimals),
		"total_credits": ledger.FormatDecimal(tb.TotalCredits, cur.Decimals),
		"lines":         lines,
	})
}

// integrity is the endpoint a monitor polls: it re-derives every account's
// balance from its entries and reports any that disagree with the running
// balance the posting engine wrote. A healthy ledger returns an empty list.
func (h *Handlers) integrity(c *fiber.Ctx) error {
	divergences, err := h.repo.VerifyRunningBalances(c.Context())
	if err != nil {
		return fail(c, err)
	}
	out := make([]fiber.Map, 0, len(divergences))
	for _, d := range divergences {
		out = append(out, fiber.Map{
			"gl_code": d.GLCode,
			"running": d.Running.String(),
			"derived": d.Derived.String(),
		})
	}
	status := fiber.StatusOK
	if len(out) > 0 {
		status = fiber.StatusConflict
	}
	return c.Status(status).JSON(fiber.Map{"healthy": len(out) == 0, "divergences": out})
}

func (h *Handlers) closePeriod(c *fiber.Ctx) error {
	var req struct {
		Currency    string `json:"currency"` // "" closes every currency
		ClosingDate string `json:"closing_date"`
		Reason      string `json:"reason"`
	}
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	date, err := time.Parse("2006-01-02", req.ClosingDate)
	if err != nil {
		return badRequest(c, "closing_date must be YYYY-MM-DD")
	}
	closure, err := h.repo.ClosePeriod(c.Context(), req.Currency, date, req.Reason, actor(c))
	if err != nil {
		return fail(c, err)
	}
	return c.Status(fiber.StatusCreated).JSON(closure)
}

func (h *Handlers) getTransfer(c *fiber.Ctx) error {
	t, err := h.repo.FindByCorrelationID(c.Params("correlationId"))
	if err != nil {
		return fail(c, err)
	}
	return c.JSON(t)
}

// ---------------------------------------------------------------------------
// Plumbing
// ---------------------------------------------------------------------------

// idempotencyKey is mandatory on every write. Generating one server-side would
// defeat the point: the guarantee only holds if the *client* sends the same key
// when it retries.
func idempotencyKey(c *fiber.Ctx) (string, error) {
	key := c.Get("Idempotency-Key")
	if key == "" {
		return "", &ledger.PostingError{
			Code:    "MISSING_IDEMPOTENCY_KEY",
			Message: "an Idempotency-Key header is required on every write, and must be reused when retrying",
		}
	}
	return key, nil
}

// deriveCorrelationID gives a request's saga a stable id derived from its
// idempotency key, so a retried request resumes the same saga rather than
// starting a second one against the same money.
func deriveCorrelationID(idempotencyKey string) string {
	return uuid.NewSHA1(uuid.NameSpaceOID, []byte("saga:"+idempotencyKey)).String()
}

func actor(c *fiber.Ctx) string {
	if sub := c.Get("X-User-Id"); sub != "" {
		return sub
	}
	return "api"
}

// amountForWallet parses a wire amount at the wallet's own currency scale —
// "10.00" is 1000 in a USD wallet and 10000000 in a USD-X one.
func (h *Handlers) amountForWallet(c *fiber.Ctx, walletID string, amount ledger.DecimalAmount) (*big.Int, error) {
	w, err := h.repo.Wallet(c.Context(), walletID)
	if err != nil {
		return nil, err
	}
	cur, err := h.repo.Currency(c.Context(), w.Currency)
	if err != nil {
		return nil, err
	}
	return amount.In(cur)
}

func (h *Handlers) renderWallet(c *fiber.Ctx, w *ledger.Wallet) fiber.Map {
	out := fiber.Map{
		"id":       w.ID,
		"user_id":  w.UserID,
		"currency": w.Currency,
		"chain":    w.Chain,
		"address":  w.Address,
		"status":   w.Status,
		"label":    w.Label,
	}
	bal, err := h.repo.Balance(c.Context(), w.AccountID)
	if err != nil {
		return out
	}
	if cur, err := h.repo.Currency(c.Context(), w.Currency); err == nil {
		out["balance"] = ledger.FormatDecimal(bal, cur.Decimals)
	}
	return out
}

func (h *Handlers) renderTransaction(c *fiber.Ctx, tx *ledger.Transaction) fiber.Map {
	decimals := map[string]int32{}
	lines := make([]fiber.Map, 0, len(tx.Entries))
	for _, e := range tx.Entries {
		d, ok := decimals[e.Currency]
		if !ok {
			if cur, err := h.repo.Currency(c.Context(), e.Currency); err == nil {
				d = cur.Decimals
				decimals[e.Currency] = d
			}
		}
		lines = append(lines, fiber.Map{
			"line_no":         e.LineNo,
			"account_id":      e.AccountID,
			"direction":       e.Direction,
			"currency":        e.Currency,
			"amount":          ledger.FormatDecimal(e.Amount, d),
			"running_balance": ledger.FormatDecimal(e.RunningBalance, d),
			"description":     e.Description,
		})
	}
	return fiber.Map{
		"id":           tx.ID,
		"type":         tx.Type,
		"status":       tx.Status,
		"reversed":     tx.Reversed,
		"value_date":   tx.ValueDate.Format("2006-01-02"),
		"description":  tx.Description,
		"external_ref": tx.ExternalRef,
		"entries":      lines,
	}
}

func stringField(m map[string]any, key string) string {
	if m == nil {
		return ""
	}
	s, _ := m[key].(string)
	return s
}

func badRequest(c *fiber.Ctx, msg string) error {
	return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": msg})
}

// fail maps a domain rejection to the right status code. A PostingError is
// always the caller's to fix — unbalanced, overdrawn, frozen, closed period —
// so it never becomes a 500 and its code travels to the client.
func fail(c *fiber.Ctx, err error) error {
	var pe *ledger.PostingError
	if errors.As(err, &pe) {
		return c.Status(statusFor(pe.Code)).JSON(fiber.Map{"error": pe.Message, "code": pe.Code})
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found"})
	}
	return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
}

func statusFor(code string) int {
	switch code {
	case "UNKNOWN_ACCOUNT", "UNKNOWN_WALLET", "UNKNOWN_QUOTE", "UNKNOWN_CURRENCY":
		return fiber.StatusNotFound
	case "INSUFFICIENT_FUNDS", "ACCOUNT_FROZEN", "ACCOUNT_CLOSED", "PERIOD_CLOSED",
		"ALREADY_REVERSED", "WALLET_NOT_EMPTY", "QUOTE_EXPIRED":
		return fiber.StatusConflict
	default:
		return fiber.StatusBadRequest
	}
}
