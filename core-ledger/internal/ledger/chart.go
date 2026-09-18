package ledger

import (
	"fmt"

	"github.com/google/uuid"
)

// ---------------------------------------------------------------------------
// The chart of accounts.
//
// GL codes are structured, not arbitrary: the first digit is the account type
// (1 asset, 2 liability, 3 equity, 4 revenue, 5 expense — the convention
// Fineract ships with), and each dot descends one level of the hierarchy. The
// GL* helpers below are this service's equivalent of Fineract's
// acc_product_mapping table: the single place that decides which account a
// given role posts to, so no flow in flows.go ever names a raw code.
//
//	1000 Assets
//	  1100 Cash at custodian            1100.<CCY>
//	  1200 FX position                  1200.<CCY>
//	  1300 USD-X in circulation         (USDX, leaf)
//	2000 Liabilities
//	  2100 Customer wallets             2100.<CCY> -> 2100.<CCY>.<walletID>
//	  2200 Reserve backing              2200.<CCY>
//	  2300 Suspense                     2300.BRIDGE, 2300.FIAT.<CCY>
//	3000 Equity
//	  3100 Retained earnings
//	4000 Revenue
//	  4100 Issuance fees                4100.<CCY>
//	  4200 Redemption fees              4200.<CCY>
//	  4300 FX spread                    4300.<CCY>
//	  4400 Transfer fees                4400.<CCY>
//	5000 Expenses
//	  5100 On-chain gas                 5100.<CCY>
//	  5200 Bank charges                 5200.<CCY>
// ---------------------------------------------------------------------------

const (
	GLAssets      = "1000"
	GLTrustBankHd = "1100"
	GLFxPosHd     = "1200"
	GLCirculation = "1300"

	GLLiabilities    = "2000"
	GLWalletsHd      = "2100"
	GLReserveHd      = "2200"
	GLSuspenseHd     = "2300"
	GLBridgeSuspense = "2300.BRIDGE"

	GLEquity   = "3000"
	GLRetained = "3100"

	GLRevenue      = "4000"
	GLIssuanceHd   = "4100"
	GLRedemptionHd = "4200"
	GLFxSpreadHd   = "4300"
	GLTransferHd   = "4400"

	GLExpenses    = "5000"
	GLGasHd       = "5100"
	GLBankChrgsHd = "5200"
)

// Per-currency leaf codes.
func GLTrustBank(ccy string) string      { return GLTrustBankHd + "." + ccy }
func GLFxPosition(ccy string) string     { return GLFxPosHd + "." + ccy }
func GLReserveBacking(ccy string) string { return GLReserveHd + "." + ccy }
func GLFiatSuspense(ccy string) string   { return GLSuspenseHd + ".FIAT." + ccy }
func GLIssuanceFee(ccy string) string    { return GLIssuanceHd + "." + ccy }
func GLRedemptionFee(ccy string) string  { return GLRedemptionHd + "." + ccy }
func GLFxSpread(ccy string) string       { return GLFxSpreadHd + "." + ccy }
func GLTransferFee(ccy string) string    { return GLTransferHd + "." + ccy }
func GLGas(ccy string) string            { return GLGasHd + "." + ccy }
func GLBankCharges(ccy string) string    { return GLBankChrgsHd + "." + ccy }

// GLWalletParent is the per-currency rollup every user wallet in that currency
// hangs off, so "total owed to customers in KES" is one subtree sum.
func GLWalletParent(ccy string) string { return GLWalletsHd + "." + ccy }

// GLWallet is the leaf account holding one wallet's balance.
func GLWallet(ccy, walletID string) string { return GLWalletsHd + "." + ccy + "." + walletID }

// accountNamespace makes account ids a deterministic function of the GL code,
// so seeding the chart is idempotent across environments and a fixture in a
// test has the same id as the row in staging.
var accountNamespace = uuid.MustParse("9b1f0c5a-6d3e-5f8a-9c21-7e4b0a2d6f13")

func AccountIDFor(glCode string) string {
	return uuid.NewSHA1(accountNamespace, []byte(glCode)).String()
}

// accountSpec is one row of the chart before it becomes an Account.
type accountSpec struct {
	code     string
	name     string
	parent   string // "" for a root
	typ      AccountType
	currency string // "" on multi-currency headers
	usage    AccountUsage
	manual   bool
	desc     string
}

// baseChart is the currency-independent skeleton.
var baseChart = []accountSpec{
	{code: GLAssets, name: "Assets", typ: ASSET, usage: UsageHeader},
	{code: GLTrustBankHd, name: "Cash at custodian", parent: GLAssets, typ: ASSET, usage: UsageHeader,
		desc: "Segregated trust-bank accounts holding the fiat that backs USD-X."},
	{code: GLFxPosHd, name: "FX position", parent: GLAssets, typ: ASSET, usage: UsageHeader,
		desc: "House currency exposure accumulated by conversions; revaluing these is the FX P&L."},
	{code: GLCirculation, name: "USD-X in circulation", parent: GLAssets, typ: ASSET, currency: USDXCode, usage: UsageDetail,
		desc: "Mirror of reserve backing, denominated in USD-X. Its debit balance is total USD-X outstanding and must equal on-chain supply across all chains."},

	{code: GLLiabilities, name: "Liabilities", typ: LIABILITY, usage: UsageHeader},
	{code: GLWalletsHd, name: "Customer wallets", parent: GLLiabilities, typ: LIABILITY, usage: UsageHeader,
		desc: "What the platform owes its users. Every user balance is a liability, never an asset."},
	{code: GLReserveHd, name: "Reserve backing", parent: GLLiabilities, typ: LIABILITY, usage: UsageHeader,
		desc: "Fiat set aside against issued USD-X; no longer a customer fiat claim, not yet the platform's own money."},
	{code: GLSuspenseHd, name: "Suspense", parent: GLLiabilities, typ: LIABILITY, usage: UsageHeader,
		desc: "Value in flight between two settled states."},
	{code: GLBridgeSuspense, name: "Bridge in transit", parent: GLSuspenseHd, typ: LIABILITY, currency: USDXCode, usage: UsageDetail,
		desc: "USD-X burned on a source chain but not yet minted on the destination. Its balance at any instant is live cross-chain exposure."},

	{code: GLEquity, name: "Equity", typ: EQUITY, usage: UsageHeader},
	{code: GLRetained, name: "Retained earnings", parent: GLEquity, typ: EQUITY, currency: PegCurrency, usage: UsageDetail, manual: true},

	{code: GLRevenue, name: "Revenue", typ: REVENUE, usage: UsageHeader},
	{code: GLIssuanceHd, name: "Issuance fees", parent: GLRevenue, typ: REVENUE, usage: UsageHeader},
	{code: GLRedemptionHd, name: "Redemption fees", parent: GLRevenue, typ: REVENUE, usage: UsageHeader},
	{code: GLFxSpreadHd, name: "FX spread", parent: GLRevenue, typ: REVENUE, usage: UsageHeader},
	{code: GLTransferHd, name: "Transfer fees", parent: GLRevenue, typ: REVENUE, usage: UsageHeader},

	{code: GLExpenses, name: "Expenses", typ: EXPENSE, usage: UsageHeader},
	{code: GLGasHd, name: "On-chain gas", parent: GLExpenses, typ: EXPENSE, usage: UsageHeader},
	{code: GLBankChrgsHd, name: "Bank charges", parent: GLExpenses, typ: EXPENSE, usage: UsageHeader},
}

// perCurrencyChart returns the leaves a currency needs. Fiat and USD-X differ:
// USD-X is issued rather than custodied, so it has no cash-at-custodian, no
// reserve backing and no FX position of its own.
func perCurrencyChart(c Currency) []accountSpec {
	specs := []accountSpec{
		{code: GLWalletParent(c.Code), name: "Customer wallets — " + c.Code, parent: GLWalletsHd,
			typ: LIABILITY, currency: c.Code, usage: UsageHeader},
		{code: GLTransferFee(c.Code), name: "Transfer fees — " + c.Code, parent: GLTransferHd,
			typ: REVENUE, currency: c.Code, usage: UsageDetail},
	}

	if c.Kind == CurrencyCrypto {
		return append(specs,
			accountSpec{code: GLGas(c.Code), name: "On-chain gas — " + c.Code, parent: GLGasHd,
				typ: EXPENSE, currency: c.Code, usage: UsageDetail, manual: true},
		)
	}

	return append(specs,
		accountSpec{code: GLTrustBank(c.Code), name: "Cash at custodian — " + c.Code, parent: GLTrustBankHd,
			typ: ASSET, currency: c.Code, usage: UsageDetail},
		accountSpec{code: GLFxPosition(c.Code), name: "FX position — " + c.Code, parent: GLFxPosHd,
			typ: ASSET, currency: c.Code, usage: UsageDetail},
		accountSpec{code: GLReserveBacking(c.Code), name: "Reserve backing — " + c.Code, parent: GLReserveHd,
			typ: LIABILITY, currency: c.Code, usage: UsageDetail},
		accountSpec{code: GLFiatSuspense(c.Code), name: "Fiat in transit — " + c.Code, parent: GLSuspenseHd,
			typ: LIABILITY, currency: c.Code, usage: UsageDetail},
		accountSpec{code: GLIssuanceFee(c.Code), name: "Issuance fees — " + c.Code, parent: GLIssuanceHd,
			typ: REVENUE, currency: c.Code, usage: UsageDetail},
		accountSpec{code: GLRedemptionFee(c.Code), name: "Redemption fees — " + c.Code, parent: GLRedemptionHd,
			typ: REVENUE, currency: c.Code, usage: UsageDetail},
		accountSpec{code: GLFxSpread(c.Code), name: "FX spread — " + c.Code, parent: GLFxSpreadHd,
			typ: REVENUE, currency: c.Code, usage: UsageDetail},
		accountSpec{code: GLBankCharges(c.Code), name: "Bank charges — " + c.Code, parent: GLBankChrgsHd,
			typ: EXPENSE, currency: c.Code, usage: UsageDetail, manual: true},
	)
}

// toAccount materializes a spec, resolving its hierarchy path from already-
// built ancestors. The path holds GL codes rather than ids so a subtree query
// (hierarchy LIKE '.1000.1100.%') is readable in a psql session.
func (s accountSpec) toAccount(byCode map[string]*Account) (*Account, error) {
	hierarchy := "."
	var parentID *string
	if s.parent != "" {
		p, ok := byCode[s.parent]
		if !ok {
			return nil, fmt.Errorf("chart of accounts: %s declares parent %s which is not defined before it", s.code, s.parent)
		}
		if p.Usage != UsageHeader {
			return nil, fmt.Errorf("chart of accounts: %s hangs off %s, which is a DETAIL account", s.code, s.parent)
		}
		hierarchy = p.Hierarchy
		parentID = &p.ID
	}

	return &Account{
		ID:                   AccountIDFor(s.code),
		GLCode:               s.code,
		Name:                 s.name,
		Type:                 s.typ,
		Currency:             s.currency,
		NormalSide:           s.typ.NormalSide(),
		ParentID:             parentID,
		Hierarchy:            hierarchy + s.code + ".",
		Usage:                s.usage,
		ManualEntriesAllowed: s.manual,
		Status:               AccountActive,
		Description:          s.desc,
	}, nil
}

// BuildChart produces every system account for the given currencies, parents
// before children. It is pure — seeding it is Repository.EnsureChart's job —
// which is what lets the whole chart be unit-tested without a database.
func BuildChart(currencies []Currency) ([]*Account, error) {
	byCode := make(map[string]*Account)
	out := make([]*Account, 0, len(baseChart)+len(currencies)*10)

	add := func(specs []accountSpec) error {
		for _, s := range specs {
			a, err := s.toAccount(byCode)
			if err != nil {
				return err
			}
			if _, dup := byCode[s.code]; dup {
				return fmt.Errorf("chart of accounts: duplicate GL code %s", s.code)
			}
			byCode[s.code] = a
			out = append(out, a)
		}
		return nil
	}

	if err := add(baseChart); err != nil {
		return nil, err
	}
	for _, c := range currencies {
		if err := add(perCurrencyChart(c)); err != nil {
			return nil, err
		}
	}
	return out, nil
}

// newWalletAccount builds the leaf LIABILITY account behind a wallet. Manual
// entries are barred: an operator who needs to adjust a customer balance has
// to post a transaction that says why, or reverse the one that was wrong.
func newWalletAccount(w *Wallet, parent *Account) *Account {
	code := GLWallet(w.Currency, w.ID)
	label := w.Label
	if label == "" {
		label = w.Currency + " wallet"
	}
	return &Account{
		ID:                   AccountIDFor(code),
		GLCode:               code,
		Name:                 label + " (" + w.UserID + ")",
		Type:                 LIABILITY,
		Currency:             w.Currency,
		NormalSide:           LIABILITY.NormalSide(),
		ParentID:             &parent.ID,
		Hierarchy:            parent.Hierarchy + code + ".",
		Usage:                UsageDetail,
		ManualEntriesAllowed: false,
		OwnerUserID:          &w.UserID,
		Status:               AccountActive,
		Description:          "Customer wallet liability",
	}
}

// DefaultCurrencies seeds the currencies the platform launches with. USD-X's
// decimals mirror both chains' on-chain decimals(); the fiat scales are the
// ISO 4217 minor units.
func DefaultCurrencies() []Currency {
	return []Currency{
		{Code: "USD", Kind: CurrencyFiat, Decimals: 2, Name: "US Dollar", Active: true},
		{Code: "EUR", Kind: CurrencyFiat, Decimals: 2, Name: "Euro", Active: true},
		{Code: "GBP", Kind: CurrencyFiat, Decimals: 2, Name: "Pound Sterling", Active: true},
		{Code: "KES", Kind: CurrencyFiat, Decimals: 2, Name: "Kenyan Shilling", Active: true},
		{Code: USDXCode, Kind: CurrencyCrypto, Decimals: USDXDecimals, Name: "USD-X", Active: true},
	}
}
