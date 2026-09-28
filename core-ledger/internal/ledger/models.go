package ledger

import (
	"math/big"
	"time"
)

// ---------------------------------------------------------------------------
// Conventions
//
// gorm tags below are for query-time type mapping (column names, the *big.Int
// and json serializers) only. Schema itself — constraints, defaults, indexes —
// is owned by the SQL files under migrations/ (goose), not by these structs.
//
// Every monetary amount in this package is an integer count of its currency's
// smallest unit (cents for USD, 1e-6 USDX), paired with a currency code. There
// are no floats and no decimals below this line; see amount.go for the
// conversion at the API boundary.
//
// The accounting model borrows its shape from Apache Fineract's
// acc_gl_account / acc_gl_journal_entry / acc_gl_closure tables — a hierarchy
// of GL accounts where only leaf (DETAIL) accounts are postable, journal lines
// that are append-only and carry their own running balance, corrections made
// by contra-entry rather than mutation, and closed periods that reject
// back-dated posts. Fineract's product/loan machinery is deliberately left
// behind (see the memo on why Fineract itself was rejected as the engine).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Layer 0 — reference data
// ---------------------------------------------------------------------------

type CurrencyKind string

const (
	CurrencyFiat   CurrencyKind = "FIAT"   // USD, EUR, KES — held at a custodian
	CurrencyCrypto CurrencyKind = "CRYPTO" // USDX — held on-chain
)

// Currency replaces what used to be a hard-coded USDXDecimals constant. Scale
// is per-currency (USD has 2 places, USDX has 6), so nothing can convert
// between a decimal string and smallest units without saying which currency it
// is talking about.
type Currency struct {
	Code     string       `gorm:"column:code;primaryKey"` // ISO 4217 for fiat, "USDX" for the token
	Kind     CurrencyKind `gorm:"column:kind"`
	Decimals int32        `gorm:"column:decimals"`
	Name     string       `gorm:"column:name"`
	Active   bool         `gorm:"column:active"`
}

func (Currency) TableName() string { return "currencies" }

// USDXCode is the one currency this platform issues rather than custodies.
const USDXCode = "USDX"

// PegCurrency is the fiat currency USD-X is issued 1:1 against. Issuance and
// redemption always run through it; any other fiat currency has to be
// converted to it first (see FlowConvert), which keeps every transaction type
// doing exactly one job.
const PegCurrency = "USD"

// ---------------------------------------------------------------------------
// Layer 1 — the double-entry spine
// ---------------------------------------------------------------------------

type AccountType string

const (
	ASSET     AccountType = "ASSET"
	LIABILITY AccountType = "LIABILITY"
	EQUITY    AccountType = "EQUITY"
	REVENUE   AccountType = "REVENUE"
	EXPENSE   AccountType = "EXPENSE"
)

// NormalSide is the direction that increases an account of this type. It is
// derived, never stored by hand, so an account can't be seeded with a normal
// side that contradicts its type.
func (t AccountType) NormalSide() Direction {
	switch t {
	case ASSET, EXPENSE:
		return DirDebit
	default: // LIABILITY, EQUITY, REVENUE
		return DirCredit
	}
}

func (t AccountType) Valid() bool {
	switch t {
	case ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE:
		return true
	}
	return false
}

type Direction string

const (
	DirDebit  Direction = "DEBIT"
	DirCredit Direction = "CREDIT"
)

func (d Direction) Opposite() Direction {
	if d == DirDebit {
		return DirCredit
	}
	return DirDebit
}

// signVs reports whether a posting in direction d increases (+1) or decreases
// (-1) an account whose normal side is normal. This is what makes a running
// balance readable: a user's wallet (a LIABILITY, normal side CREDIT) reads
// positive for "we owe them this much", not negative.
func (d Direction) signVs(normal Direction) int {
	if d == normal {
		return 1
	}
	return -1
}

// AccountUsage is Fineract's account_usage: HEADER accounts exist only to roll
// their children up for reporting and can never be posted to; DETAIL accounts
// are the leaves that actually hold entries.
type AccountUsage string

const (
	UsageHeader AccountUsage = "HEADER"
	UsageDetail AccountUsage = "DETAIL"
)

type AccountStatus string

const (
	AccountActive AccountStatus = "ACTIVE"
	AccountFrozen AccountStatus = "FROZEN" // compliance hold: no new postings
	AccountClosed AccountStatus = "CLOSED" // settled and retired; never postable
)

// Account is a node in the chart of accounts. Hierarchy is a materialized path
// of ancestor ids ("." for a root, ".<root>.<child>." below it) — Fineract's
// trick for subtree rollups in one indexed LIKE instead of a recursive CTE.
type Account struct {
	ID       string      `gorm:"column:id;primaryKey"`
	GLCode   string      `gorm:"column:gl_code"` // unique, human-facing: "2100.USDX.<walletID>"
	Name     string      `gorm:"column:name"`
	Type     AccountType `gorm:"column:type"`
	Currency string      `gorm:"column:currency"`

	// NormalSide is persisted (rather than derived on read) so a report can
	// interpret historical entries without joining back to the type, and so a
	// future type reclassification can't silently re-sign old balances.
	NormalSide AccountUsageDirection `gorm:"column:normal_side"`

	ParentID  *string      `gorm:"column:parent_id"`
	Hierarchy string       `gorm:"column:hierarchy"`
	Usage     AccountUsage `gorm:"column:usage"`

	// ManualEntriesAllowed is Fineract's guard against an operator hand-posting
	// into an account the system maintains as an invariant (USDX in
	// circulation, the bridge suspense account, any user wallet). Corrections
	// to those go through a reversal of the originating transaction instead.
	ManualEntriesAllowed bool `gorm:"column:manual_entries_allowed"`

	// OwnerUserID is nil for internal/system accounts and set for the
	// liability account behind a user's wallet.
	OwnerUserID *string `gorm:"column:owner_user_id"`

	Status      AccountStatus `gorm:"column:status"`
	Description string        `gorm:"column:description"`
	CreatedAt   time.Time     `gorm:"column:created_at;autoCreateTime"`
	UpdatedAt   time.Time     `gorm:"column:updated_at;autoUpdateTime"`
}

func (Account) TableName() string { return "accounts" }

// AccountUsageDirection is an alias kept distinct in the struct field so the
// column reads as what it is; it is the same value space as Direction.
type AccountUsageDirection = Direction

// Postable reports whether the posting engine will accept entries against this
// account at all, independent of who is asking.
func (a *Account) Postable() error {
	if a.Usage != UsageDetail {
		return &PostingError{Code: "ACCOUNT_NOT_DETAIL", Message: "account " + a.GLCode + " is a HEADER account and cannot be posted to"}
	}
	if a.Status == AccountClosed {
		return &PostingError{Code: "ACCOUNT_CLOSED", Message: "account " + a.GLCode + " is closed"}
	}
	return nil
}

// ---------------------------------------------------------------------------

type TxType string

const (
	TxFiatDeposit     TxType = "FIAT_DEPOSIT"      // custodian credit -> user fiat wallet
	TxFiatWithdrawal  TxType = "FIAT_WITHDRAWAL"   // user fiat wallet -> custodian debit
	TxUSDXIssue       TxType = "USDX_ISSUE"        // fiat claim -> USDX claim (mint)
	TxUSDXRedeem      TxType = "USDX_REDEEM"       // USDX claim -> fiat claim (burn)
	TxFXConversion    TxType = "FX_CONVERSION"     // fiat -> fiat across a quote
	TxInternalXfer    TxType = "INTERNAL_TRANSFER" // wallet -> wallet, same currency
	TxChainBridgeOut  TxType = "CHAIN_BRIDGE_OUT"  // burn leg: wallet -> bridge suspense
	TxChainBridgeIn   TxType = "CHAIN_BRIDGE_IN"   // mint leg: bridge suspense -> wallet
	TxBridgeCompensat TxType = "BRIDGE_COMPENSATE" // failed mint: suspense -> source wallet
	TxFee             TxType = "FEE"               // standalone fee charge
	TxManualJournal   TxType = "MANUAL_JOURNAL"    // operator-entered adjustment
	TxReversal        TxType = "REVERSAL"          // contra-entry of another transaction
)

func (t TxType) Valid() bool {
	switch t {
	case TxFiatDeposit, TxFiatWithdrawal, TxUSDXIssue, TxUSDXRedeem, TxFXConversion,
		TxInternalXfer, TxChainBridgeOut, TxChainBridgeIn, TxBridgeCompensat,
		TxFee, TxManualJournal, TxReversal:
		return true
	}
	return false
}

type TxStatus string

const (
	TxPosted   TxStatus = "POSTED"   // entries are final and count toward balances
	TxReversed TxStatus = "REVERSED" // still counts; a contra transaction cancels it
)

// EntityType is Fineract's entity_type_enum: a polymorphic back-reference from
// the journal to whatever domain object caused it, so you can walk from a
// balance movement to the bridge saga or bank payment that produced it without
// a column per source system.
type EntityType string

const (
	EntityNone           EntityType = ""
	EntityBridgeTransfer EntityType = "BRIDGE_TRANSFER"
	EntityBankPayment    EntityType = "BANK_PAYMENT"
	EntityFXConversion   EntityType = "FX_CONVERSION"
	EntityWallet         EntityType = "WALLET"
)

// ValidateCallerEntity checks a back-reference supplied by a caller rather
// than chosen by a flow.
//
// Transfer stamps no entity at all today, which means an invoice settlement,
// a treasury rebalance and a payroll run are indistinguishable in the journal
// — you can see that value moved and never what moved it. Letting callers
// stamp their own closes that, but only against an allow-list: an arbitrary
// string would make entity_type unqueryable, and BRIDGE_TRANSFER is reserved
// because the saga finds its own legs through it and a caller borrowing that
// namespace would have its transaction reversed by a compensation it has
// nothing to do with.
func ValidateCallerEntity(typ EntityType, id string) error {
	if typ == EntityNone {
		if id != "" {
			return postErr("ENTITY_TYPE_REQUIRED", "entity_id was given without an entity_type")
		}
		return nil
	}
	if id == "" {
		return postErr("ENTITY_ID_REQUIRED", "entity_type %s was given without an entity_id", typ)
	}
	switch typ {
	case EntityBankPayment, EntityFXConversion, EntityWallet:
		return nil
	case EntityBridgeTransfer:
		return postErr("ENTITY_TYPE_RESERVED",
			"%s is reserved for the bridge saga's own journal legs", typ)
	default:
		return postErr("UNKNOWN_ENTITY_TYPE", "entity_type %q is not one this ledger knows", typ)
	}
}

// Transaction is the journal header: one business event, one atomic set of
// entries. Balances are never edited — a mistake is corrected by posting a
// Reversal whose entries mirror this one's, which is why there is no UPDATE
// path for Amount or Direction anywhere in this package.
type Transaction struct {
	ID     string   `gorm:"column:id;primaryKey"`
	Type   TxType   `gorm:"column:type"`
	Status TxStatus `gorm:"column:status"`

	// IdempotencyKey is client-supplied and UNIQUE. A retry of the same
	// request returns the original transaction rather than posting twice —
	// the DAMP spec requires this on every mint/burn/transfer path.
	IdempotencyKey string `gorm:"column:idempotency_key"`

	// Reversed/ReversalTxID mirror Fineract's reversed + reversal_id pair: the
	// original row is flagged and points at its contra, and the contra points
	// back through ReversesTxID. Both rows survive; neither is mutated beyond
	// the flag.
	Reversed     bool    `gorm:"column:reversed"`
	ReversalTxID *string `gorm:"column:reversal_tx_id"`
	ReversesTxID *string `gorm:"column:reverses_tx_id"`

	// ManualEntry distinguishes an operator's journal from a system-generated
	// one, which is the first thing any auditor filters on.
	ManualEntry bool `gorm:"column:manual_entry"`

	EntityType EntityType `gorm:"column:entity_type"`
	EntityID   string     `gorm:"column:entity_id"`

	ExternalRef string  `gorm:"column:external_ref"` // bank payment ref, chain tx hash, PSP id
	FxQuoteID   *string `gorm:"column:fx_quote_id"`

	// ValueDate is the accounting date (what closures and reports work on);
	// CreatedAt is the wall-clock insert time. They differ for back-dated
	// bank settlements.
	ValueDate   time.Time `gorm:"column:value_date"`
	Description string    `gorm:"column:description"`
	InitiatedBy string    `gorm:"column:initiated_by"`

	Metadata  map[string]any `gorm:"column:metadata;serializer:json"`
	CreatedAt time.Time      `gorm:"column:created_at;autoCreateTime"`

	Entries []JournalEntry `gorm:"foreignKey:TransactionID;references:ID"`
}

func (Transaction) TableName() string { return "transactions" }

// JournalEntry is one posting line. Append-only: this package issues no UPDATE
// and no DELETE against journal_entries, and the migration revokes nothing
// less than that intent in comments for whoever comes next.
type JournalEntry struct {
	// Seq is a global monotonic sequence (BIGSERIAL). It gives every account a
	// deterministic "latest entry" for running-balance reads and gives the
	// journal as a whole a stable replay order.
	Seq int64 `gorm:"column:seq;primaryKey;autoIncrement"`

	ID            string `gorm:"column:id"`
	TransactionID string `gorm:"column:transaction_id"`
	LineNo        int32  `gorm:"column:line_no"` // ordinal within the transaction

	AccountID string    `gorm:"column:account_id"`
	Direction Direction `gorm:"column:direction"`
	Currency  string    `gorm:"column:currency"`

	// Amount is always positive; Direction carries the sign. Storing signed
	// amounts would make "sum of debits equals sum of credits" unverifiable
	// after the fact.
	Amount *big.Int `gorm:"column:amount;serializer:bigint"`

	// RunningBalance is this account's signed balance (in its normal side)
	// immediately after this line, computed inside the same SERIALIZABLE
	// transaction that inserts it. It makes a current balance an O(1) read
	// without a mutable balance column anywhere, and any divergence between it
	// and SUM(entries) is a detectable tamper/bug signal — see
	// Repository.VerifyRunningBalances.
	RunningBalance *big.Int `gorm:"column:running_balance;serializer:bigint"`

	ValueDate   time.Time `gorm:"column:value_date"`
	Description string    `gorm:"column:description"`
	CreatedAt   time.Time `gorm:"column:created_at;autoCreateTime"`
}

func (JournalEntry) TableName() string { return "journal_entries" }

// LedgerClosure is Fineract's acc_gl_closure: once a period is closed for a
// currency, nothing may be posted with a value date on or before that date.
// A Currency of "" closes the period across every currency at once.
type LedgerClosure struct {
	ID          string    `gorm:"column:id;primaryKey"`
	Currency    string    `gorm:"column:currency"`
	ClosingDate time.Time `gorm:"column:closing_date"`
	Reason      string    `gorm:"column:reason"`
	ClosedBy    string    `gorm:"column:closed_by"`
	CreatedAt   time.Time `gorm:"column:created_at;autoCreateTime"`
}

func (LedgerClosure) TableName() string { return "ledger_closures" }

// ---------------------------------------------------------------------------
// Layer 2 — product
// ---------------------------------------------------------------------------

type WalletStatus string

const (
	WalletActive WalletStatus = "ACTIVE"
	WalletFrozen WalletStatus = "FROZEN"
	WalletClosed WalletStatus = "CLOSED"
)

// Wallet is the user-facing container; the money itself lives in AccountID, a
// LIABILITY account (what the platform owes this user in this currency). The
// split is deliberate: a wallet carries product concerns — label, freeze,
// chain address, which user owns it — while the account carries accounting
// concerns, and neither leaks into the other.
//
// One wallet per (user, currency, chain). Chain is "" for fiat; a user holding
// USD-X on both chains has two USDX wallets, which is what makes a bridge a
// movement between two of their own accounts rather than an untracked hop.
type Wallet struct {
	ID        string `gorm:"column:id;primaryKey"`
	UserID    string `gorm:"column:user_id"`
	Currency  string `gorm:"column:currency"`
	Chain     string `gorm:"column:chain"` // "" (fiat) | "ETHEREUM" | "SOLANA"
	AccountID string `gorm:"column:account_id"`

	// Address is the on-chain address funds are minted to / burned from. Empty
	// for fiat wallets.
	Address string `gorm:"column:address"`

	Status    WalletStatus `gorm:"column:status"`
	Label     string       `gorm:"column:label"`
	CreatedAt time.Time    `gorm:"column:created_at;autoCreateTime"`
	UpdatedAt time.Time    `gorm:"column:updated_at;autoUpdateTime"`
}

func (Wallet) TableName() string { return "wallets" }

// FxQuote is a rate captured at a point in time and referenced by the
// transaction that consumed it, so a conversion can always be re-derived from
// the rate it actually got rather than whatever the rate is now.
//
// Rate is scaled by 10^FxRateScale and reads as "1 BaseCcy = Rate QuoteCcy",
// before spread. SpreadBps is taken out of the quote-side proceeds and booked
// to REVENUE:FX_SPREAD.
type FxQuote struct {
	ID        string   `gorm:"column:id;primaryKey"`
	BaseCcy   string   `gorm:"column:base_ccy"`
	QuoteCcy  string   `gorm:"column:quote_ccy"`
	Rate      *big.Int `gorm:"column:rate;serializer:bigint"`
	SpreadBps int32    `gorm:"column:spread_bps"`
	Source    string   `gorm:"column:source"` // rate provider

	QuotedAt  time.Time `gorm:"column:quoted_at"`
	ExpiresAt time.Time `gorm:"column:expires_at"`
	CreatedAt time.Time `gorm:"column:created_at;autoCreateTime"`
}

func (FxQuote) TableName() string { return "fx_quotes" }

// FxRateScale is the number of decimal places an FxQuote.Rate is scaled by.
// 18 is generous enough that a KES/USD rate loses nothing and a hyperinflated
// pair still has headroom.
const FxRateScale = 18

func (q *FxQuote) Expired(at time.Time) bool {
	return !q.ExpiresAt.IsZero() && at.After(q.ExpiresAt)
}

// ---------------------------------------------------------------------------
// Bridge saga state (pre-existing; now a satellite of the journal)
// ---------------------------------------------------------------------------

type TransferStatus string

const (
	StatusPending       TransferStatus = "PENDING"
	StatusBurnConfirmed TransferStatus = "BURN_CONFIRMED"
	StatusMintSubmitted TransferStatus = "MINT_SUBMITTED"
	StatusCompleted     TransferStatus = "COMPLETED"
	StatusFailed        TransferStatus = "FAILED"
	StatusCompensated   TransferStatus = "COMPENSATED" // failed mint, re-minted on source
)

// SagaKind is the shape of the saga, which the old code inferred from whether
// SourceChain was empty. Making it explicit is what lets a redemption exist at
// all: a redemption burns on a source chain and mints on none, which the
// "empty source chain means fresh mint" heuristic had no way to express.
type SagaKind string

const (
	SagaMint   SagaKind = "MINT"   // fiat -> USD-X: mint on target, no burn
	SagaBridge SagaKind = "BRIDGE" // chain -> chain: burn on source, mint on target
	SagaRedeem SagaKind = "REDEEM" // USD-X -> fiat: burn on source, mint on none
)

func (k SagaKind) Valid() bool {
	switch k {
	case SagaMint, SagaBridge, SagaRedeem:
		return true
	}
	return false
}

// BridgeTransfer is no longer the record of value — it is saga state. The
// money movement it describes lives in the journal, reachable through the
// transactions whose EntityType is BRIDGE_TRANSFER and EntityID is this
// CorrelationID (one for the burn leg, one for the mint leg).
type BridgeTransfer struct {
	CorrelationID string         `gorm:"column:correlation_id;primaryKey"`
	Kind          SagaKind       `gorm:"column:kind"`
	Amount        *big.Int       `gorm:"column:amount;serializer:bigint"`
	SourceChain   string         `gorm:"column:source_chain"` // "" (fresh mint) | "ETHEREUM" | "SOLANA"
	TargetChain   string         `gorm:"column:target_chain"` // "" (redemption) | "ETHEREUM" | "SOLANA"
	Status        TransferStatus `gorm:"column:status"`
	SourceTxHash  string         `gorm:"column:source_tx_hash"`
	DestTxHash    string         `gorm:"column:dest_tx_hash"`

	// SourceAddress is burned from, TargetAddress is minted to. They are
	// separate because on a bridge they are addresses on different chains and
	// therefore never the same string — which the single user_address column
	// this replaces could not express, so every cross-chain burn went to an
	// address derived from the wrong chain's.
	SourceAddress string `gorm:"column:source_address"`
	TargetAddress string `gorm:"column:target_address"`

	// UserID and the two wallet ids tie the saga to the journal. SourceWalletID
	// is empty for a fresh mint (nothing is being debited on a source chain).
	UserID         string `gorm:"column:user_id"`
	SourceWalletID string `gorm:"column:source_wallet_id"`
	TargetWalletID string `gorm:"column:target_wallet_id"`

	// LedgerTxID names the exact journal transaction this saga settles.
	// A redemption can't be found by entity back-reference the way a bridge
	// can: Redeem stamps EntityType=WALLET, so walking entity_id would match
	// every redemption that wallet has ever made rather than this one.
	LedgerTxID string `gorm:"column:ledger_tx_id"`

	// Durability: how many times the worker has picked this up, when it may
	// next be picked up, and which worker currently holds the lease. A row
	// whose lease has expired is free for anyone to claim, which is what makes
	// `kill -9` survivable without a distributed lock service.
	Attempts       int        `gorm:"column:attempts"`
	NextAttemptAt  time.Time  `gorm:"column:next_attempt_at"`
	LeaseOwner     string     `gorm:"column:lease_owner"`
	LeaseExpiresAt *time.Time `gorm:"column:lease_expires_at"`
	LastError      string     `gorm:"column:last_error"`

	CreatedAt time.Time `gorm:"column:created_at;autoCreateTime"`
	UpdatedAt time.Time `gorm:"column:updated_at;autoUpdateTime"`
}

func (BridgeTransfer) TableName() string { return "bridge_transfers" }

// Terminal reports whether a saga has stopped moving of its own accord.
func (s TransferStatus) Terminal() bool {
	switch s {
	case StatusCompleted, StatusFailed, StatusCompensated:
		return true
	}
	return false
}

// SagaDeadLetter is a saga that spent its attempt budget. It exists separately
// from the transfer row because the transfer answers "where is the money" and
// this answers "what does an operator still have to do", and once someone
// starts working the queue those two have different lifecycles.
type SagaDeadLetter struct {
	CorrelationID string     `gorm:"column:correlation_id;primaryKey"`
	Kind          SagaKind   `gorm:"column:kind"`
	Stage         string     `gorm:"column:stage"`
	Attempts      int        `gorm:"column:attempts"`
	LastError     string     `gorm:"column:last_error"`
	FailedAt      time.Time  `gorm:"column:failed_at;autoCreateTime"`
	ResolvedAt    *time.Time `gorm:"column:resolved_at"`
	ResolvedBy    string     `gorm:"column:resolved_by"`
	Resolution    string     `gorm:"column:resolution"`
}

func (SagaDeadLetter) TableName() string { return "saga_dead_letters" }

// ---------------------------------------------------------------------------
// Reconciliation snapshots (pre-existing)
// ---------------------------------------------------------------------------

// The three snapshot tables below are reconciliation's inputs. Until P3 not
// one of them had a writer — see reserves.go, which is where they got one.

type EthSupplySnapshot struct {
	BlockNumber uint64   `gorm:"column:block_number;primaryKey"`
	TotalSupply *big.Int `gorm:"column:total_supply;serializer:bigint"`
	// BlockHash is what makes a snapshot survivable across a reorg: the
	// indexer can tell "block 1234 again" from "a *different* block 1234".
	BlockHash  string    `gorm:"column:block_hash"`
	Source     string    `gorm:"column:source"`
	CapturedAt time.Time `gorm:"column:captured_at;autoCreateTime"`
}

func (EthSupplySnapshot) TableName() string { return "eth_supply_snapshot" }

type SolSupplySnapshot struct {
	Slot        uint64    `gorm:"column:slot;primaryKey"`
	TotalSupply *big.Int  `gorm:"column:total_supply;serializer:bigint"`
	Source      string    `gorm:"column:source"`
	CapturedAt  time.Time `gorm:"column:captured_at;autoCreateTime"`
}

func (SolSupplySnapshot) TableName() string { return "sol_supply_snapshot" }

// TrustBankSnapshot is one custodian's statement balance as of a moment.
// services/rms writes these through POST /reserves/custodian-snapshots; the
// "Bank Adapter service (not part of this repo)" this comment used to name
// never existed, which is exactly why Leg C was skipped on every run the
// platform has ever performed.
type TrustBankSnapshot struct {
	CustodianID  string    `gorm:"column:custodian_id;primaryKey"`
	Currency     string    `gorm:"column:currency;primaryKey"`
	AsOf         time.Time `gorm:"column:as_of;primaryKey"`
	Balance      *big.Int  `gorm:"column:balance;serializer:bigint"`
	Source       string    `gorm:"column:source"`
	StatementRef string    `gorm:"column:statement_ref"`
}

func (TrustBankSnapshot) TableName() string { return "trust_bank_snapshot" }
