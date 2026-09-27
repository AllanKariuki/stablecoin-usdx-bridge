package api

import (
	"errors"
	"fmt"
	"log/slog"
	"math/big"
	"time"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/ledger"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/shared/go/platform"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Handlers struct {
	repo   *ledger.Repository
	ledger *ledger.Service
	logger *slog.Logger
}

// NewHandlers no longer takes a saga. The API's job on a money-moving write
// ends at persisting the intent: cmd/worker claims it from the queue and runs
// it. That split is what makes the saga survive a restart of the process that
// accepted the request.
func NewHandlers(repo *ledger.Repository, svc *ledger.Service, logger *slog.Logger) *Handlers {
	return &Handlers{repo: repo, ledger: svc, logger: logger}
}

func (h *Handlers) Register(app *fiber.App) {
	// Wallets
	app.Post("/wallets", h.createWallet)
	app.Get("/users/:userId/wallets", h.listWallets)
	app.Get("/wallets/:walletId", h.getWallet)
	app.Get("/wallets/:walletId/statement", h.getStatement)
	app.Post("/wallets/:walletId/status", h.setWalletStatus)

	// Money movement. Every one of these goes through h.idempotent, so a
	// retry replays the first call's bytes instead of re-running the handler.
	app.Post("/deposits", h.idempotent, h.deposit)
	app.Post("/withdrawals", h.idempotent, h.withdraw)
	app.Post("/transfers", h.idempotent, h.transfer)
	app.Post("/fx/quotes", h.createQuote)
	app.Post("/fx/conversions", h.idempotent, h.convert)
	app.Post("/issuances", h.idempotent, h.issue)
	app.Post("/redemptions", h.idempotent, h.redeem)
	app.Post("/redemptions/:transactionId/confirm", h.idempotent, h.confirmRedemption)
	app.Post("/bridges", h.idempotent, h.bridgeTransfer)

	// Journal
	app.Get("/transactions", h.listTransactions)
	app.Get("/transactions/:transactionId", h.getTransaction)
	app.Post("/transactions/:transactionId/reversal", h.reverseTransaction)
	app.Get("/accounts", h.listAccounts)
	app.Get("/accounts/:glCode/balance", h.accountBalance)
	app.Get("/ledger/trial-balance", h.trialBalance)
	app.Get("/ledger/integrity", h.integrity)
	app.Post("/ledger/closures", h.closePeriod)

	// Operator surface. TxFee and TxManualJournal have been declared and
	// validated by the engine since it was written and unreachable the whole
	// time; treasury needs both in P3.
	app.Post("/ledger/fees", h.idempotent, h.chargeFee)
	app.Post("/ledger/journals", h.idempotent, h.manualJournal)

	// Bridge saga state
	app.Get("/transfers/:correlationId", h.getTransfer)
	app.Get("/sagas/dead-letters", h.listDeadLetters)
	app.Post("/sagas/dead-letters/:correlationId/resolve", h.resolveDeadLetter)
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
	from, err := parseDateParam(c, "from")
	if err != nil {
		return badRequest(c, "from must be YYYY-MM-DD")
	}
	to, err := parseDateParam(c, "to")
	if err != nil {
		return badRequest(c, "to must be YYYY-MM-DD")
	}
	entries, err := h.repo.Statement(c.Context(), w.AccountID, from, to, clampLimit(c.QueryInt("limit"), 100, 500))
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

	// entityRef lets the caller say what this movement settles. See
	// ledger.ValidateCallerEntity for why it is an allow-list.
	EntityType ledger.EntityType `json:"entity_type"`
	EntityID   string            `json:"entity_id"`
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
		EntityType:     req.EntityType,
		EntityID:       req.EntityID,
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
		EntityType   ledger.EntityType    `json:"entity_type"`
		EntityID     string               `json:"entity_id"`
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
		EntityType:     req.EntityType,
		EntityID:       req.EntityID,
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
		EntityType   ledger.EntityType    `json:"entity_type"`
		EntityID     string               `json:"entity_id"`
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
		EntityType:     req.EntityType,
		EntityID:       req.EntityID,
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

	// Enqueue, don't execute. The old `go h.saga.Execute(...)` put the whole
	// mint inside a goroutine belonging to this request's process, so a deploy
	// or a crash between here and the on-chain confirmation stranded the USD-X
	// in suspense with nothing in the system that would ever look for it.
	transfer, err := h.repo.UpsertTransfer(c.Context(), &ledger.BridgeTransfer{
		CorrelationID:  correlationID,
		Kind:           ledger.SagaMint,
		UserAddress:    usdxWallet.Address,
		Amount:         usdxAmount,
		SourceChain:    "", // fresh mint: nothing is burned
		TargetChain:    usdxWallet.Chain,
		Status:         ledger.StatusPending,
		UserID:         usdxWallet.UserID,
		TargetWalletID: usdxWallet.ID,
		LedgerTxID:     tx.ID,
	})
	if err != nil {
		return fail(c, err)
	}

	out := h.renderTransaction(c, tx)
	out["correlation_id"] = transfer.CorrelationID
	out["saga_status"] = transfer.Status
	return c.Status(fiber.StatusAccepted).JSON(out)
}

// redeem takes the user's USD-X out of their wallet into the in-transit
// account and enqueues the burn saga that destroys it on chain and releases
// their fiat.
//
// The saga is the part that did not exist. Until now this endpoint posted the
// journal, returned 202 and stopped: no burn was ever submitted, and
// /redemptions/:id/confirm waited for a chain_tx_hash that nothing in the
// repository produced. USD-X entered the suspense account and never left, so
// the peg was one-way — and a stablecoin you cannot exit is not one.
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
	usdxWallet, err := h.repo.Wallet(c.Context(), req.USDXWalletID)
	if err != nil {
		return fail(c, err)
	}
	if usdxWallet.Chain == "" {
		return badRequest(c, "a redemption burns USD-X on a chain; this wallet names none")
	}

	correlationID := deriveCorrelationID(key)

	tx, err := h.ledger.Redeem(c.Context(), ledger.RedeemRequest{
		USDXWalletID:   req.USDXWalletID,
		FiatWalletID:   req.FiatWalletID,
		Amount:         amount,
		IdempotencyKey: key,
		CorrelationID:  correlationID,
		InitiatedBy:    actor(c),
	})
	if err != nil {
		return fail(c, err)
	}

	// target_chain is empty: a redemption burns on its source chain and mints
	// on none. ledger_tx_id is carried explicitly because Redeem stamps
	// EntityType=WALLET, so walking the entity back-reference would match
	// every redemption that wallet has ever made rather than this one.
	transfer, err := h.repo.UpsertTransfer(c.Context(), &ledger.BridgeTransfer{
		CorrelationID:  correlationID,
		Kind:           ledger.SagaRedeem,
		UserAddress:    usdxWallet.Address,
		Amount:         amount,
		SourceChain:    usdxWallet.Chain,
		TargetChain:    "",
		Status:         ledger.StatusPending,
		UserID:         usdxWallet.UserID,
		SourceWalletID: usdxWallet.ID,
		LedgerTxID:     tx.ID,
	})
	if err != nil {
		return fail(c, err)
	}

	out := h.renderTransaction(c, tx)
	out["correlation_id"] = transfer.CorrelationID
	out["saga_status"] = transfer.Status
	return c.Status(fiber.StatusAccepted).JSON(out)
}

// confirmRedemption is operator break-glass, not the happy path.
//
// The worker settles a redemption automatically once it has burned on chain
// and seen finality. This route exists for the case the worker cannot get
// there — the burn landed but the process died before observing it, an RPC
// endpoint that will not serve the receipt — where the alternative is a
// customer's fiat held indefinitely against USD-X that is already destroyed.
//
// It therefore demands a reason, records who used it, and marks the saga
// settled so the worker does not also burn. Putting it behind maker-checker is
// P5's job (services/workflow); until then the audit trail is the control.
func (h *Handlers) confirmRedemption(c *fiber.Ctx) error {
	var req struct {
		ChainTxHash string `json:"chain_tx_hash"`
		Reason      string `json:"reason"`
	}
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	if req.ChainTxHash == "" {
		return badRequest(c, "chain_tx_hash is required: break-glass settlement must name the burn it is settling")
	}
	if req.Reason == "" {
		return badRequest(c, "reason is required: this route bypasses the saga and must say why")
	}

	redeemTxID := c.Params("transactionId")
	h.logger.Warn("break-glass redemption settlement",
		slog.String("transaction_id", redeemTxID),
		slog.String("chain_tx_hash", req.ChainTxHash),
		slog.String("actor", actor(c)),
		slog.String("reason", req.Reason))

	tx, err := h.ledger.ConfirmRedemption(c.Context(), redeemTxID, req.ChainTxHash, "", actor(c))
	if err != nil {
		return fail(c, err)
	}

	// Settle the saga too, or the worker will submit the burn this route just
	// declared already done.
	if t, err := h.repo.TransferForLedgerTx(c.Context(), redeemTxID); err == nil {
		_ = h.repo.RecordChainTx(c.Context(), t.CorrelationID, "source_tx_hash", req.ChainTxHash)
		_ = h.repo.SettleTransfer(c.Context(), t.CorrelationID, ledger.StatusCompleted,
			"settled by operator break-glass: "+req.Reason)
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

	transfer, err := h.repo.UpsertTransfer(c.Context(), &ledger.BridgeTransfer{
		CorrelationID:  deriveCorrelationID(key),
		Kind:           ledger.SagaBridge,
		UserAddress:    to.Address,
		Amount:         amount,
		SourceChain:    from.Chain,
		TargetChain:    to.Chain,
		Status:         ledger.StatusPending,
		UserID:         from.UserID,
		SourceWalletID: from.ID,
		TargetWalletID: to.ID,
	})
	if err != nil {
		return fail(c, err)
	}

	return c.Status(fiber.StatusAccepted).JSON(renderTransfer(transfer))
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

// listTransactions is the cross-wallet transaction feed core-ledger didn't
// have before — a single user's transactions in one page instead of one
// GET /wallets/:id/statement per wallet, which is what the BFF's dashboard
// aggregation would otherwise cost. user_id is optional so an operator
// (with transactions:read:any) can browse the full journal; a caller
// scoped to transactions:read:own only is expected to always pass their
// own id — enforcement of that is the gateway/BFF's job (see
// services/auth-proxy's route table), not this handler's.
func (h *Handlers) listTransactions(c *fiber.Ctx) error {
	afterCreatedAt, afterID, err := decodeTxCursor(c.Query("cursor"))
	if err != nil {
		return badRequest(c, err.Error())
	}
	limit := clampLimit(c.QueryInt("limit"), 50, 200)

	// Fetch one extra row to know whether a next page exists without a
	// separate COUNT query — trimmed back to limit before rendering.
	txs, err := h.repo.ListTransactionsPage(c.Context(), c.Query("user_id"), afterCreatedAt, afterID, limit+1)
	if err != nil {
		return fail(c, err)
	}
	hasMore := len(txs) > limit
	if hasMore {
		txs = txs[:limit]
	}

	out := make([]fiber.Map, 0, len(txs))
	for i := range txs {
		out = append(out, h.renderTransaction(c, &txs[i]))
	}

	nextCursor := ""
	if hasMore {
		last := txs[len(txs)-1]
		nextCursor = encodeTxCursor(last.CreatedAt, last.ID)
	}
	return c.JSON(fiber.Map{"transactions": out, "next_cursor": nextCursor})
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

// listAccounts is the chart of accounts, paginated — used by treasury/audit
// tooling to browse it rather than pulling every account (which will keep
// growing: one liability account per wallet, see GLCode's
// "2100.<CCY>.<walletID>" shape) in a single response.
func (h *Handlers) listAccounts(c *fiber.Ctx) error {
	afterGLCode, err := decodeAccountCursor(c.Query("cursor"))
	if err != nil {
		return badRequest(c, err.Error())
	}
	limit := clampLimit(c.QueryInt("limit"), 50, 200)

	accounts, err := h.repo.ListAccountsPage(c.Context(), afterGLCode, limit+1)
	if err != nil {
		return fail(c, err)
	}
	hasMore := len(accounts) > limit
	if hasMore {
		accounts = accounts[:limit]
	}

	decimals := map[string]int32{}
	out := make([]fiber.Map, 0, len(accounts))
	for _, a := range accounts {
		d, ok := decimals[a.Currency]
		if !ok && a.Currency != "" {
			if cur, err := h.repo.Currency(c.Context(), a.Currency); err == nil {
				d = cur.Decimals
				decimals[a.Currency] = d
			}
		}
		bal, err := h.repo.Balance(c.Context(), a.ID)
		balance := ""
		if err == nil {
			balance = ledger.FormatDecimal(bal, d)
		}
		out = append(out, fiber.Map{
			"id":       a.ID,
			"gl_code":  a.GLCode,
			"name":     a.Name,
			"type":     a.Type,
			"currency": a.Currency,
			"status":   a.Status,
			"balance":  balance,
		})
	}

	nextCursor := ""
	if hasMore {
		nextCursor = encodeAccountCursor(accounts[len(accounts)-1].GLCode)
	}
	return c.JSON(fiber.Map{"accounts": out, "next_cursor": nextCursor})
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
	return c.Status(fiber.StatusCreated).JSON(renderClosure(closure))
}

func (h *Handlers) getTransfer(c *fiber.Ctx) error {
	t, err := h.repo.FindByCorrelationID(c.Params("correlationId"))
	if err != nil {
		return fail(c, err)
	}
	return c.JSON(renderTransfer(t))
}

// ---------------------------------------------------------------------------
// Operator surface
// ---------------------------------------------------------------------------

// chargeFee books a standalone fee. TxFee has been a valid transaction type
// with a chart account behind it since the engine was written, and no route
// could produce one.
func (h *Handlers) chargeFee(c *fiber.Ctx) error {
	var req struct {
		WalletID  string               `json:"wallet_id"`
		Amount    ledger.DecimalAmount `json:"amount"`
		FeeGLCode string               `json:"fee_gl_code"`
		Reason    string               `json:"reason"`
	}
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	key, err := idempotencyKey(c)
	if err != nil {
		return fail(c, err)
	}
	if req.FeeGLCode == "" {
		return badRequest(c, "fee_gl_code is required: a fee has to land in a named revenue account")
	}
	amount, err := h.amountForWallet(c, req.WalletID, req.Amount)
	if err != nil {
		return fail(c, err)
	}

	tx, err := h.ledger.ChargeFee(c.Context(), ledger.ChargeFeeRequest{
		WalletID:       req.WalletID,
		Amount:         amount,
		FeeGLCode:      req.FeeGLCode,
		IdempotencyKey: key,
		Reason:         req.Reason,
		InitiatedBy:    actor(c),
	})
	if err != nil {
		return fail(c, err)
	}
	return c.Status(fiber.StatusCreated).JSON(h.renderTransaction(c, tx))
}

// manualJournal posts an operator-entered adjustment. The engine's
// ManualEntriesAllowed guard is what keeps this from being a way around the
// invariants: every account carrying one rejects a hand-posted line.
func (h *Handlers) manualJournal(c *fiber.Ctx) error {
	var req struct {
		Reason string `json:"reason"`
		Lines  []struct {
			GLCode      string               `json:"gl_code"`
			Direction   ledger.Direction     `json:"direction"`
			Amount      ledger.DecimalAmount `json:"amount"`
			Description string               `json:"description"`
		} `json:"lines"`
	}
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	key, err := idempotencyKey(c)
	if err != nil {
		return fail(c, err)
	}

	lines := make([]ledger.ManualLine, 0, len(req.Lines))
	for i, l := range req.Lines {
		acct, err := h.repo.AccountByGLCode(c.Context(), l.GLCode)
		if err != nil {
			return fail(c, err)
		}
		cur, err := h.repo.Currency(c.Context(), acct.Currency)
		if err != nil {
			return fail(c, err)
		}
		// Each line is parsed at its own account's scale: a journal touching
		// a USD account and a USD-X one has two different meanings for "10.00"
		// and reading both at one scale is off by four orders of magnitude.
		amount, err := l.Amount.In(cur)
		if err != nil {
			return badRequest(c, fmt.Sprintf("line %d: %s", i+1, err.Error()))
		}
		lines = append(lines, ledger.ManualLine{
			GLCode:      l.GLCode,
			Direction:   l.Direction,
			Amount:      amount,
			Description: l.Description,
		})
	}

	tx, err := h.ledger.ManualJournal(c.Context(), ledger.ManualJournalRequest{
		Lines:          lines,
		IdempotencyKey: key,
		Reason:         req.Reason,
		InitiatedBy:    actor(c),
	})
	if err != nil {
		return fail(c, err)
	}
	return c.Status(fiber.StatusCreated).JSON(h.renderTransaction(c, tx))
}

// listDeadLetters is the operator's queue of sagas that stopped moving. It is
// the answer to "what is stuck", which before P2 could only be reconstructed
// by reading logs and guessing.
func (h *Handlers) listDeadLetters(c *fiber.Ctx) error {
	entries, err := h.repo.OpenDeadLetters(c.Context(), clampLimit(c.QueryInt("limit"), 50, 200))
	if err != nil {
		return fail(c, err)
	}
	out := make([]fiber.Map, 0, len(entries))
	for _, e := range entries {
		out = append(out, fiber.Map{
			"correlation_id": e.CorrelationID,
			"kind":           e.Kind,
			"stage":          e.Stage,
			"attempts":       e.Attempts,
			"last_error":     e.LastError,
			"failed_at":      e.FailedAt.UTC().Format(time.RFC3339),
		})
	}
	return c.JSON(fiber.Map{"dead_letters": out})
}

// resolveDeadLetter closes an entry and, if the saga never reached a terminal
// state, hands it back to the workers with a fresh attempt budget — resolving
// is the operator's "I fixed the thing that was broken", and retrying is what
// that means in practice.
func (h *Handlers) resolveDeadLetter(c *fiber.Ctx) error {
	var req struct {
		Resolution string `json:"resolution"`
	}
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	if req.Resolution == "" {
		return badRequest(c, "resolution is required: say what was done about it")
	}
	if err := h.repo.ResolveDeadLetter(c.Context(), c.Params("correlationId"), actor(c), req.Resolution); err != nil {
		return fail(c, err)
	}
	t, err := h.repo.FindByCorrelationID(c.Params("correlationId"))
	if err != nil {
		return fail(c, err)
	}
	return c.JSON(renderTransfer(t))
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
		"created_at":   tx.CreatedAt.UTC().Format(time.RFC3339),
		"entries":      lines,
	}
}

// renderClosure gives LedgerClosure — a raw GORM model with no json tags of
// its own — the same explicit snake_case shape every other endpoint uses,
// instead of leaking Go's default PascalCase field names.
func renderClosure(cl *ledger.LedgerClosure) fiber.Map {
	return fiber.Map{
		"id":           cl.ID,
		"currency":     cl.Currency,
		"closing_date": cl.ClosingDate.Format("2006-01-02"),
		"reason":       cl.Reason,
		"closed_by":    cl.ClosedBy,
		"created_at":   cl.CreatedAt.UTC().Format(time.RFC3339),
	}
}

// renderTransfer does the same for BridgeTransfer, and formats Amount as
// the decimal-string USD-X is displayed everywhere else — a bare *big.Int
// marshals as an unquoted JSON number, breaking the "amounts are always
// strings" contract the frontend's Money handling depends on (see
// docs/building-plan.md's P1 decision on why a float/number amount never
// appears in a response body).
func renderTransfer(t *ledger.BridgeTransfer) fiber.Map {
	return fiber.Map{
		"correlation_id":   t.CorrelationID,
		"kind":             t.Kind,
		"user_id":          t.UserID,
		"user_address":     t.UserAddress,
		"amount":           ledger.FormatDecimal(t.Amount, ledger.USDXDecimals),
		"source_chain":     t.SourceChain,
		"target_chain":     t.TargetChain,
		"status":           t.Status,
		"source_tx_hash":   t.SourceTxHash,
		"dest_tx_hash":     t.DestTxHash,
		"source_wallet_id": t.SourceWalletID,
		"target_wallet_id": t.TargetWalletID,
		"ledger_tx_id":     t.LedgerTxID,
		// The retry state a client polling this endpoint needs to tell "still
		// working on it" from "stuck": before P2 a stalled saga and a healthy
		// one both read PENDING forever.
		"attempts":        t.Attempts,
		"next_attempt_at": t.NextAttemptAt.UTC().Format(time.RFC3339),
		"last_error":      t.LastError,
		"created_at":      t.CreatedAt.UTC().Format(time.RFC3339),
		"updated_at":      t.UpdatedAt.UTC().Format(time.RFC3339),
	}
}

func stringField(m map[string]any, key string) string {
	if m == nil {
		return ""
	}
	s, _ := m[key].(string)
	return s
}

// badRequest covers request-shape problems (unparseable body, missing
// required field) that never reach the posting engine, so they have no
// ledger.PostingError to carry a specific code. INVALID_REQUEST keeps the
// {error, code, request_id} envelope uniform rather than silently omitting
// code here.
func badRequest(c *fiber.Ctx, msg string) error {
	return platform.WriteError(c, fiber.StatusBadRequest, "INVALID_REQUEST", msg)
}

// fail maps a domain rejection to the right status code. A PostingError is
// always the caller's to fix — unbalanced, overdrawn, frozen, closed period —
// so it never becomes a 500 and its code travels to the client. Every branch
// carries a code: a generated client typed against a required `code` field
// must never see a response missing one.
func fail(c *fiber.Ctx, err error) error {
	var pe *ledger.PostingError
	if errors.As(err, &pe) {
		return platform.WriteError(c, statusFor(pe.Code), pe.Code, pe.Message)
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return platform.WriteError(c, fiber.StatusNotFound, "NOT_FOUND", "not found")
	}
	return platform.WriteError(c, fiber.StatusInternalServerError, "INTERNAL", "internal error")
}

func statusFor(code string) int {
	switch code {
	case "UNKNOWN_ACCOUNT", "UNKNOWN_WALLET", "UNKNOWN_QUOTE", "UNKNOWN_CURRENCY":
		return fiber.StatusNotFound
	case "NO_OPEN_DEAD_LETTER":
		return fiber.StatusNotFound
	case "INSUFFICIENT_FUNDS", "ACCOUNT_FROZEN", "ACCOUNT_CLOSED", "PERIOD_CLOSED",
		"ALREADY_REVERSED", "WALLET_NOT_EMPTY", "QUOTE_EXPIRED",
		"IDEMPOTENCY_KEY_REUSED", "IDEMPOTENT_REQUEST_IN_PROGRESS":
		return fiber.StatusConflict
	default:
		return fiber.StatusBadRequest
	}
}
