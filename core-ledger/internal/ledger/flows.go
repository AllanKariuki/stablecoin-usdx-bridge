package ledger

import (
	"context"
	"math/big"
	"time"
)

// ---------------------------------------------------------------------------
// Flows — the business events, each expressed as the journal it produces.
//
// Read these as accounting first and code second. Every function here does the
// same three things: resolve the accounts involved, compute the amounts, and
// hand one balanced PostRequest to the engine. None of them touches a balance
// directly, and none of them can post half a transaction.
//
// A note that explains most of the shapes below: a user's money is a LIABILITY
// of the platform. Crediting a wallet increases what we owe them; debiting it
// reduces that. The custodian cash is the ASSET on the other side. Confusing
// the two is the single most common way a ledger ends up upside down.
// ---------------------------------------------------------------------------

// FeeSchedule is the platform's pricing, in basis points. It lives here rather
// than in a table because it is small and changes with a deploy; when it needs
// to vary per customer tier, it becomes a lookup and these call sites stay the
// same.
type FeeSchedule struct {
	IssuanceBps   int32
	RedemptionBps int32
	TransferBps   int32
	WithdrawalBps int32
}

type Service struct {
	repo *Repository
	fees FeeSchedule
	now  func() time.Time
}

func NewService(repo *Repository, fees FeeSchedule) *Service {
	return &Service{repo: repo, fees: fees, now: func() time.Time { return time.Now().UTC() }}
}

func (s *Service) Repo() *Repository { return s.repo }

// resolved bundles a wallet with everything a flow needs to post against it.
type resolved struct {
	wallet   *Wallet
	account  *Account
	currency *Currency
}

func (s *Service) resolve(ctx context.Context, walletID string) (*resolved, error) {
	w, err := s.repo.Wallet(ctx, walletID)
	if err != nil {
		return nil, err
	}
	a, err := s.repo.Account(ctx, w.AccountID)
	if err != nil {
		return nil, err
	}
	c, err := s.repo.Currency(ctx, w.Currency)
	if err != nil {
		return nil, err
	}
	return &resolved{wallet: w, account: a, currency: c}, nil
}

func (s *Service) systemAccount(ctx context.Context, glCode string) (*Account, error) {
	return s.repo.AccountByGLCode(ctx, glCode)
}

// ---------------------------------------------------------------------------
// Fiat in and out
// ---------------------------------------------------------------------------

type DepositRequest struct {
	WalletID       string
	Amount         *big.Int // smallest units of the wallet's currency
	IdempotencyKey string
	BankRef        string // the custodian's payment reference
	ValueDate      time.Time
	InitiatedBy    string
}

// Deposit records fiat arriving in the custodian account and becoming a
// customer claim.
//
//	DR  Cash at custodian    (asset up: the bank really holds more)
//	CR  Customer wallet      (liability up: we owe the user that much)
func (s *Service) Deposit(ctx context.Context, req DepositRequest) (*Transaction, error) {
	if err := requirePositive(req.Amount); err != nil {
		return nil, err
	}
	r, err := s.resolve(ctx, req.WalletID)
	if err != nil {
		return nil, err
	}
	if r.currency.Kind != CurrencyFiat {
		return nil, postErr("NOT_A_FIAT_WALLET", "deposits land in fiat wallets; %s is %s", r.wallet.ID, r.currency.Kind)
	}
	bank, err := s.systemAccount(ctx, GLTrustBank(r.currency.Code))
	if err != nil {
		return nil, err
	}

	return s.repo.Post(ctx, PostRequest{
		Type:           TxFiatDeposit,
		IdempotencyKey: req.IdempotencyKey,
		ValueDate:      req.ValueDate,
		Description:    "Fiat deposit",
		EntityType:     EntityBankPayment,
		EntityID:       req.BankRef,
		ExternalRef:    req.BankRef,
		InitiatedBy:    req.InitiatedBy,
		Postings: []Posting{
			debit(bank.ID, r.currency.Code, req.Amount, "Cash received at custodian"),
			credit(r.account.ID, r.currency.Code, req.Amount, "Deposit credited"),
		},
	})
}

type WithdrawRequest struct {
	WalletID       string
	Amount         *big.Int // gross: what leaves the user's balance
	IdempotencyKey string
	BankRef        string
	ValueDate      time.Time
	InitiatedBy    string
}

// Withdraw sends fiat back out to the user's bank.
//
//	DR  Customer wallet      gross   (we owe them less)
//	CR  Cash at custodian    net     (only the net actually leaves the bank)
//	CR  Transfer fee revenue fee     (the fee stays behind as ours)
func (s *Service) Withdraw(ctx context.Context, req WithdrawRequest) (*Transaction, error) {
	if err := requirePositive(req.Amount); err != nil {
		return nil, err
	}
	r, err := s.resolve(ctx, req.WalletID)
	if err != nil {
		return nil, err
	}
	if r.currency.Kind != CurrencyFiat {
		return nil, postErr("NOT_A_FIAT_WALLET", "withdrawals leave fiat wallets; %s is %s", r.wallet.ID, r.currency.Kind)
	}
	bank, err := s.systemAccount(ctx, GLTrustBank(r.currency.Code))
	if err != nil {
		return nil, err
	}
	feeAcct, err := s.systemAccount(ctx, GLTransferFee(r.currency.Code))
	if err != nil {
		return nil, err
	}

	fee := ApplyBps(req.Amount, s.fees.WithdrawalBps)
	net := new(big.Int).Sub(req.Amount, fee)

	postings := []Posting{
		debit(r.account.ID, r.currency.Code, req.Amount, "Withdrawal"),
		credit(bank.ID, r.currency.Code, net, "Paid out from custodian"),
	}
	if fee.Sign() > 0 {
		postings = append(postings, credit(feeAcct.ID, r.currency.Code, fee, "Withdrawal fee"))
	}

	return s.repo.Post(ctx, PostRequest{
		Type:                TxFiatWithdrawal,
		IdempotencyKey:      req.IdempotencyKey,
		ValueDate:           req.ValueDate,
		Description:         "Fiat withdrawal",
		EntityType:          EntityBankPayment,
		EntityID:            req.BankRef,
		ExternalRef:         req.BankRef,
		InitiatedBy:         req.InitiatedBy,
		NonNegativeAccounts: []string{r.account.ID},
		Postings:            postings,
	})
}

// ---------------------------------------------------------------------------
// Issuance and redemption — fiat <-> USD-X
// ---------------------------------------------------------------------------

type IssueRequest struct {
	// FiatWalletID must be a USD wallet: USD-X is defined as 1:1 against USD,
	// so a KES holder converts to USD first (Convert) and then issues. Keeping
	// the FX out of issuance means each transaction type has exactly one thing
	// that can go wrong with it.
	FiatWalletID   string
	USDXWalletID   string
	Amount         *big.Int // gross USD, smallest units
	IdempotencyKey string
	// CorrelationID links this issuance to the bridge saga that will mint the
	// tokens on chain, so the saga can find the transaction to settle (or
	// reverse) without a column of its own.
	CorrelationID string
	ValueDate     time.Time
	InitiatedBy   string
}

// Issue converts a fiat claim into a USD-X claim. The cash itself never moves:
// it stays in the custodian account throughout, which is why no asset account
// is touched on the fiat side. What changes is the *shape of the claim* on it.
//
//	USD  leg:  DR  Customer USD wallet     gross
//	           CR  Reserve backing         net     (fiat now earmarked as backing)
//	           CR  Issuance fee revenue    fee
//	USDX leg:  DR  USD-X in circulation    usdx    (supply created)
//	           CR  USD-X in transit        usdx    (owed to the user once minted)
//
// The USD-X does not land in the user's wallet here. It sits in the in-transit
// suspense account until the chain mint confirms, at which point
// ConfirmUSDXCredit moves it. That gap is real — the tokens genuinely do not
// exist on chain yet — and modelling it is what lets reconciliation prove
// ledger supply and on-chain supply agree instead of explaining away a
// difference.
func (s *Service) Issue(ctx context.Context, req IssueRequest) (*Transaction, error) {
	if err := requirePositive(req.Amount); err != nil {
		return nil, err
	}
	fiat, err := s.resolve(ctx, req.FiatWalletID)
	if err != nil {
		return nil, err
	}
	usdx, err := s.resolve(ctx, req.USDXWalletID)
	if err != nil {
		return nil, err
	}
	if fiat.currency.Code != PegCurrency {
		return nil, postErr("ISSUE_REQUIRES_PEG_CURRENCY",
			"USD-X is issued against %s; convert %s to %s first", PegCurrency, fiat.currency.Code, PegCurrency)
	}
	if usdx.currency.Code != USDXCode {
		return nil, postErr("NOT_A_USDX_WALLET", "wallet %s holds %s, not %s", usdx.wallet.ID, usdx.currency.Code, USDXCode)
	}
	if fiat.wallet.UserID != usdx.wallet.UserID {
		return nil, postErr("WALLET_OWNER_MISMATCH", "issuance moves a user's own claim; those two wallets belong to different users")
	}

	reserve, err := s.systemAccount(ctx, GLReserveBacking(PegCurrency))
	if err != nil {
		return nil, err
	}
	feeAcct, err := s.systemAccount(ctx, GLIssuanceFee(PegCurrency))
	if err != nil {
		return nil, err
	}
	circulation, err := s.systemAccount(ctx, GLCirculation)
	if err != nil {
		return nil, err
	}
	suspense, err := s.systemAccount(ctx, GLBridgeSuspense)
	if err != nil {
		return nil, err
	}

	fee := ApplyBps(req.Amount, s.fees.IssuanceBps)
	backing := new(big.Int).Sub(req.Amount, fee)

	// Convert rescales USD's 2 decimals to USD-X's 6 at the 1:1 peg. Without
	// this, 100 USD (10000 cents) would become 0.01 USD-X.
	conv := Convert(PegQuote(PegCurrency, USDXCode), backing, *fiat.currency, *usdx.currency)
	if conv.Net.Sign() <= 0 {
		return nil, postErr("AMOUNT_TOO_SMALL", "after the issuance fee there is nothing left to issue")
	}

	postings := []Posting{
		debit(fiat.account.ID, PegCurrency, req.Amount, "Fiat converted to USD-X"),
		credit(reserve.ID, PegCurrency, backing, "Earmarked as USD-X backing"),
		debit(circulation.ID, USDXCode, conv.Net, "USD-X issued"),
		credit(suspense.ID, USDXCode, conv.Net, "Awaiting on-chain mint"),
	}
	if fee.Sign() > 0 {
		postings = append(postings, credit(feeAcct.ID, PegCurrency, fee, "Issuance fee"))
	}

	return s.repo.Post(ctx, PostRequest{
		Type:                TxUSDXIssue,
		IdempotencyKey:      req.IdempotencyKey,
		ValueDate:           req.ValueDate,
		Description:         "USD-X issuance",
		EntityType:          EntityBridgeTransfer,
		EntityID:            req.CorrelationID,
		InitiatedBy:         req.InitiatedBy,
		NonNegativeAccounts: []string{fiat.account.ID},
		Metadata: map[string]any{
			"usdx_amount":  conv.Net.String(),
			"usdx_wallet":  usdx.wallet.ID,
			"usd_gross":    req.Amount.String(),
			"target_chain": usdx.wallet.Chain,
		},
		Postings: postings,
	})
}

type RedeemRequest struct {
	USDXWalletID   string
	FiatWalletID   string
	Amount         *big.Int // USD-X smallest units
	IdempotencyKey string
	ValueDate      time.Time
	InitiatedBy    string
}

// Redeem is issuance run backwards, and like issuance it is two steps: this
// one takes the USD-X out of the user's wallet into the in-transit account
// pending the on-chain burn; ConfirmRedemption releases the fiat once the burn
// is final. Paying out the fiat before the burn confirms would let a user who
// front-runs the chain spend the same value twice.
//
//	DR  Customer USD-X wallet   (we owe them less USD-X)
//	CR  USD-X in transit        (pending burn)
func (s *Service) Redeem(ctx context.Context, req RedeemRequest) (*Transaction, error) {
	if err := requirePositive(req.Amount); err != nil {
		return nil, err
	}
	usdx, err := s.resolve(ctx, req.USDXWalletID)
	if err != nil {
		return nil, err
	}
	fiat, err := s.resolve(ctx, req.FiatWalletID)
	if err != nil {
		return nil, err
	}
	if usdx.currency.Code != USDXCode {
		return nil, postErr("NOT_A_USDX_WALLET", "wallet %s holds %s", usdx.wallet.ID, usdx.currency.Code)
	}
	if fiat.currency.Code != PegCurrency {
		return nil, postErr("REDEEM_REQUIRES_PEG_CURRENCY", "USD-X redeems into %s, not %s", PegCurrency, fiat.currency.Code)
	}
	if fiat.wallet.UserID != usdx.wallet.UserID {
		return nil, postErr("WALLET_OWNER_MISMATCH", "redemption moves a user's own claim between their own wallets")
	}

	suspense, err := s.systemAccount(ctx, GLBridgeSuspense)
	if err != nil {
		return nil, err
	}

	return s.repo.Post(ctx, PostRequest{
		Type:                TxUSDXRedeem,
		IdempotencyKey:      req.IdempotencyKey,
		ValueDate:           req.ValueDate,
		Description:         "USD-X redemption requested",
		EntityType:          EntityWallet,
		EntityID:            usdx.wallet.ID,
		InitiatedBy:         req.InitiatedBy,
		NonNegativeAccounts: []string{usdx.account.ID},
		Metadata:            map[string]any{"fiat_wallet_id": fiat.wallet.ID},
		Postings: []Posting{
			debit(usdx.account.ID, USDXCode, req.Amount, "Redemption requested"),
			credit(suspense.ID, USDXCode, req.Amount, "Awaiting on-chain burn"),
		},
	})
}

// ConfirmRedemption completes a redemption once the burn is final: the USD-X
// leaves circulation for good and the fiat becomes the user's again.
//
//	USDX leg:  DR  USD-X in transit      usdx
//	           CR  USD-X in circulation  usdx    (supply destroyed)
//	USD  leg:  DR  Reserve backing       gross   (no longer backing anything)
//	           CR  Customer USD wallet   net
//	           CR  Redemption fee        fee
func (s *Service) ConfirmRedemption(ctx context.Context, redeemTxID, chainTxHash, idempotencyKey, initiatedBy string) (*Transaction, error) {
	orig, err := s.repo.FindTransaction(ctx, redeemTxID)
	if err != nil {
		return nil, err
	}
	if orig.Type != TxUSDXRedeem {
		return nil, postErr("NOT_A_REDEMPTION", "transaction %s is a %s", redeemTxID, orig.Type)
	}
	if orig.Reversed {
		return nil, postErr("REDEMPTION_REVERSED", "redemption %s was reversed", redeemTxID)
	}

	fiatWalletID, _ := orig.Metadata["fiat_wallet_id"].(string)
	fiat, err := s.resolve(ctx, fiatWalletID)
	if err != nil {
		return nil, err
	}

	var usdxAmount *big.Int
	for _, e := range orig.Entries {
		if e.Currency == USDXCode && e.Direction == DirCredit {
			usdxAmount = e.Amount
		}
	}
	if usdxAmount == nil {
		return nil, postErr("MALFORMED_REDEMPTION", "redemption %s has no USD-X credit line to settle", redeemTxID)
	}

	suspense, err := s.systemAccount(ctx, GLBridgeSuspense)
	if err != nil {
		return nil, err
	}
	circulation, err := s.systemAccount(ctx, GLCirculation)
	if err != nil {
		return nil, err
	}
	reserve, err := s.systemAccount(ctx, GLReserveBacking(PegCurrency))
	if err != nil {
		return nil, err
	}
	feeAcct, err := s.systemAccount(ctx, GLRedemptionFee(PegCurrency))
	if err != nil {
		return nil, err
	}

	usdx, err := s.repo.Currency(ctx, USDXCode)
	if err != nil {
		return nil, err
	}
	gross := Convert(PegQuote(USDXCode, PegCurrency), usdxAmount, *usdx, *fiat.currency).Gross
	fee := ApplyBps(gross, s.fees.RedemptionBps)
	net := new(big.Int).Sub(gross, fee)
	if net.Sign() <= 0 {
		return nil, postErr("AMOUNT_TOO_SMALL", "after the redemption fee there is nothing left to pay out")
	}

	postings := []Posting{
		debit(suspense.ID, USDXCode, usdxAmount, "Burn confirmed"),
		credit(circulation.ID, USDXCode, usdxAmount, "USD-X removed from circulation"),
		debit(reserve.ID, PegCurrency, gross, "Backing released"),
		credit(fiat.account.ID, PegCurrency, net, "Redemption paid"),
	}
	if fee.Sign() > 0 {
		postings = append(postings, credit(feeAcct.ID, PegCurrency, fee, "Redemption fee"))
	}
	if idempotencyKey == "" {
		idempotencyKey = "redeem-settle:" + redeemTxID
	}

	return s.repo.Post(ctx, PostRequest{
		Type:           TxUSDXRedeem,
		IdempotencyKey: idempotencyKey,
		Description:    "USD-X redemption settled",
		EntityType:     orig.EntityType,
		EntityID:       orig.EntityID,
		ExternalRef:    chainTxHash,
		InitiatedBy:    initiatedBy,
		Metadata:       map[string]any{"settles": redeemTxID},
		Postings:       postings,
	})
}

// ---------------------------------------------------------------------------
// FX — fiat to fiat
// ---------------------------------------------------------------------------

type ConvertRequest struct {
	FromWalletID   string
	ToWalletID     string
	Amount         *big.Int // smallest units of the source currency
	QuoteID        string
	IdempotencyKey string
	ValueDate      time.Time
	InitiatedBy    string
}

// Convert exchanges one currency for another between two of a user's own
// wallets.
//
//	source leg:  DR  Customer source wallet   amount
//	             CR  FX position (source)     amount
//	target leg:  DR  FX position (target)     gross
//	             CR  Customer target wallet   net
//	             CR  FX spread revenue        spread
//
// The two legs are in different units and cannot balance against each other —
// only within themselves. The FX position accounts are what absorb that: after
// the conversion the house is long one currency and short the other, which is
// a real economic position and should be visible as one rather than buried in
// a rounding difference. Revaluing those accounts at the close is the FX P&L.
func (s *Service) Convert(ctx context.Context, req ConvertRequest) (*Transaction, error) {
	if err := requirePositive(req.Amount); err != nil {
		return nil, err
	}
	from, err := s.resolve(ctx, req.FromWalletID)
	if err != nil {
		return nil, err
	}
	to, err := s.resolve(ctx, req.ToWalletID)
	if err != nil {
		return nil, err
	}
	if from.wallet.UserID != to.wallet.UserID {
		return nil, postErr("WALLET_OWNER_MISMATCH", "a conversion moves value between one user's own wallets; use a transfer to pay someone else")
	}
	if from.currency.Code == to.currency.Code {
		return nil, postErr("SAME_CURRENCY", "nothing to convert: both wallets hold %s", from.currency.Code)
	}
	if from.currency.Kind != CurrencyFiat || to.currency.Kind != CurrencyFiat {
		return nil, postErr("NOT_A_FIAT_PAIR", "fiat conversion needs two fiat wallets; use issuance or redemption to cross into USD-X")
	}

	quote, err := s.repo.Quote(ctx, req.QuoteID)
	if err != nil {
		return nil, err
	}
	if err := UsableQuote(quote, from.currency.Code, to.currency.Code, s.now()); err != nil {
		return nil, err
	}

	fromPos, err := s.systemAccount(ctx, GLFxPosition(from.currency.Code))
	if err != nil {
		return nil, err
	}
	toPos, err := s.systemAccount(ctx, GLFxPosition(to.currency.Code))
	if err != nil {
		return nil, err
	}
	spreadAcct, err := s.systemAccount(ctx, GLFxSpread(to.currency.Code))
	if err != nil {
		return nil, err
	}

	conv := Convert(quote, req.Amount, *from.currency, *to.currency)
	if conv.Net.Sign() <= 0 {
		return nil, postErr("AMOUNT_TOO_SMALL", "%s converts to less than one minor unit of %s after spread",
			FormatDecimal(req.Amount, from.currency.Decimals), to.currency.Code)
	}

	postings := []Posting{
		debit(from.account.ID, from.currency.Code, req.Amount, "Converted to "+to.currency.Code),
		credit(fromPos.ID, from.currency.Code, req.Amount, "FX position "+from.currency.Code),
		debit(toPos.ID, to.currency.Code, conv.Gross, "FX position "+to.currency.Code),
		credit(to.account.ID, to.currency.Code, conv.Net, "Converted from "+from.currency.Code),
	}
	if conv.Fee.Sign() > 0 {
		postings = append(postings, credit(spreadAcct.ID, to.currency.Code, conv.Fee, "FX spread"))
	}

	return s.repo.Post(ctx, PostRequest{
		Type:                TxFXConversion,
		IdempotencyKey:      req.IdempotencyKey,
		ValueDate:           req.ValueDate,
		Description:         from.currency.Code + " to " + to.currency.Code + " conversion",
		EntityType:          EntityFXConversion,
		EntityID:            quote.ID,
		FxQuoteID:           &quote.ID,
		InitiatedBy:         req.InitiatedBy,
		NonNegativeAccounts: []string{from.account.ID},
		Metadata: map[string]any{
			"rate":       FormatRate(quote.Rate),
			"spread_bps": quote.SpreadBps,
			"gross":      conv.Gross.String(),
			"net":        conv.Net.String(),
		},
		Postings: postings,
	})
}

// ---------------------------------------------------------------------------
// Internal transfer
// ---------------------------------------------------------------------------

type TransferRequest struct {
	FromWalletID   string
	ToWalletID     string
	Amount         *big.Int
	IdempotencyKey string
	Reference      string
	ValueDate      time.Time
	InitiatedBy    string
}

// Transfer moves value between two wallets in the same currency. Nothing
// leaves the platform, so no asset account moves — one liability shrinks and
// another grows.
func (s *Service) Transfer(ctx context.Context, req TransferRequest) (*Transaction, error) {
	if err := requirePositive(req.Amount); err != nil {
		return nil, err
	}
	from, err := s.resolve(ctx, req.FromWalletID)
	if err != nil {
		return nil, err
	}
	to, err := s.resolve(ctx, req.ToWalletID)
	if err != nil {
		return nil, err
	}
	if from.wallet.ID == to.wallet.ID {
		return nil, postErr("SAME_WALLET", "cannot transfer a wallet to itself")
	}
	if from.currency.Code != to.currency.Code {
		return nil, postErr("CURRENCY_MISMATCH", "transfer is same-currency only (%s to %s); use a conversion instead",
			from.currency.Code, to.currency.Code)
	}
	if from.currency.Code == USDXCode && from.wallet.Chain != to.wallet.Chain {
		return nil, postErr("CROSS_CHAIN_TRANSFER", "those USD-X wallets are on different chains; bridge instead of transferring")
	}

	feeAcct, err := s.systemAccount(ctx, GLTransferFee(from.currency.Code))
	if err != nil {
		return nil, err
	}
	fee := ApplyBps(req.Amount, s.fees.TransferBps)
	net := new(big.Int).Sub(req.Amount, fee)
	if net.Sign() <= 0 {
		return nil, postErr("AMOUNT_TOO_SMALL", "the transfer fee would consume the whole amount")
	}

	postings := []Posting{
		debit(from.account.ID, from.currency.Code, req.Amount, "Transfer out"),
		credit(to.account.ID, to.currency.Code, net, "Transfer in"),
	}
	if fee.Sign() > 0 {
		postings = append(postings, credit(feeAcct.ID, from.currency.Code, fee, "Transfer fee"))
	}

	return s.repo.Post(ctx, PostRequest{
		Type:                TxInternalXfer,
		IdempotencyKey:      req.IdempotencyKey,
		ValueDate:           req.ValueDate,
		Description:         "Internal transfer",
		ExternalRef:         req.Reference,
		InitiatedBy:         req.InitiatedBy,
		NonNegativeAccounts: []string{from.account.ID},
		Postings:            postings,
	})
}

// ---------------------------------------------------------------------------
// Cross-chain bridge legs
//
// A bridge is not one movement, it is two, with a gap in between where the
// value exists on neither chain. The suspense account is how double entry says
// that out loud: its balance is exactly the USD-X that has left one chain and
// not yet arrived on another, which is the number risk wants and the number
// reconciliation needs.
// ---------------------------------------------------------------------------

// BridgeOut posts the burn leg: the user's USD-X leaves their source-chain
// wallet and sits in transit.
func (s *Service) BridgeOut(ctx context.Context, walletID string, amount *big.Int, correlationID, chainTxHash string) (*Transaction, error) {
	return s.bridgeLeg(ctx, bridgeLeg{
		txType:        TxChainBridgeOut,
		walletID:      walletID,
		amount:        amount,
		correlationID: correlationID,
		chainTxHash:   chainTxHash,
		key:           "bridge-out:" + correlationID,
		walletSide:    DirDebit,
		description:   "Bridge: burned on source chain",
		checkFunds:    true,
	})
}

// BridgeIn posts the mint leg: the in-transit USD-X arrives in the
// destination-chain wallet.
func (s *Service) BridgeIn(ctx context.Context, walletID string, amount *big.Int, correlationID, chainTxHash string) (*Transaction, error) {
	return s.bridgeLeg(ctx, bridgeLeg{
		txType:        TxChainBridgeIn,
		walletID:      walletID,
		amount:        amount,
		correlationID: correlationID,
		chainTxHash:   chainTxHash,
		key:           "bridge-in:" + correlationID,
		walletSide:    DirCredit,
		description:   "Bridge: minted on destination chain",
	})
}

// BridgeCompensate returns in-transit USD-X to the wallet it came from after a
// destination mint failed and the source chain was re-minted. It is a distinct
// transaction type rather than a reversal because it is a real, separately
// evidenced on-chain event, not a correction of a bookkeeping mistake.
func (s *Service) BridgeCompensate(ctx context.Context, walletID string, amount *big.Int, correlationID, chainTxHash string) (*Transaction, error) {
	return s.bridgeLeg(ctx, bridgeLeg{
		txType:        TxBridgeCompensat,
		walletID:      walletID,
		amount:        amount,
		correlationID: correlationID,
		chainTxHash:   chainTxHash,
		key:           "bridge-compensate:" + correlationID,
		walletSide:    DirCredit,
		description:   "Bridge: re-minted on source after failed destination mint",
	})
}

// ConfirmUSDXCredit releases freshly issued USD-X from the in-transit account
// into the user's wallet, once the chain mint is final.
func (s *Service) ConfirmUSDXCredit(ctx context.Context, walletID string, amount *big.Int, correlationID, chainTxHash string) (*Transaction, error) {
	return s.bridgeLeg(ctx, bridgeLeg{
		txType:        TxChainBridgeIn,
		walletID:      walletID,
		amount:        amount,
		correlationID: correlationID,
		chainTxHash:   chainTxHash,
		key:           "issue-credit:" + correlationID,
		walletSide:    DirCredit,
		description:   "Issuance: minted on chain",
	})
}

type bridgeLeg struct {
	txType        TxType
	walletID      string
	amount        *big.Int
	correlationID string
	chainTxHash   string
	key           string
	walletSide    Direction // which side of the wallet account this leg posts
	description   string
	checkFunds    bool
}

func (s *Service) bridgeLeg(ctx context.Context, leg bridgeLeg) (*Transaction, error) {
	if err := requirePositive(leg.amount); err != nil {
		return nil, err
	}
	w, err := s.resolve(ctx, leg.walletID)
	if err != nil {
		return nil, err
	}
	if w.currency.Code != USDXCode {
		return nil, postErr("NOT_A_USDX_WALLET", "wallet %s holds %s", w.wallet.ID, w.currency.Code)
	}
	suspense, err := s.systemAccount(ctx, GLBridgeSuspense)
	if err != nil {
		return nil, err
	}

	var postings []Posting
	if leg.walletSide == DirDebit {
		postings = []Posting{
			debit(w.account.ID, USDXCode, leg.amount, leg.description),
			credit(suspense.ID, USDXCode, leg.amount, "In transit"),
		}
	} else {
		postings = []Posting{
			debit(suspense.ID, USDXCode, leg.amount, "Released from transit"),
			credit(w.account.ID, USDXCode, leg.amount, leg.description),
		}
	}

	req := PostRequest{
		Type:           leg.txType,
		IdempotencyKey: leg.key,
		Description:    leg.description,
		EntityType:     EntityBridgeTransfer,
		EntityID:       leg.correlationID,
		ExternalRef:    leg.chainTxHash,
		InitiatedBy:    "bridge-saga",
		// A compensation has to reach a wallet even if compliance froze it
		// mid-flight; leaving the user's money stranded in suspense is the
		// worse failure.
		AllowFrozen: leg.txType == TxBridgeCompensat,
	}
	if leg.checkFunds {
		req.NonNegativeAccounts = []string{w.account.ID}
	}
	req.Postings = postings

	return s.repo.Post(ctx, req)
}

func requirePositive(amount *big.Int) error {
	if amount == nil || amount.Sign() <= 0 {
		return postErr("NON_POSITIVE_AMOUNT", "amount must be greater than zero")
	}
	return nil
}
