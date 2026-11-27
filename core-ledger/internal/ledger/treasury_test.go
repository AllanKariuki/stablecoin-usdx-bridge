package ledger

import (
	"context"
	"math/big"
	"testing"
	"time"
)

// The treasury position lifecycle, end to end: a customer conversion opens a
// short, a BUY rebalance closes it, a SELL reopens it. Assertions are on
// deltas from before/after rather than absolute balances, because these tests
// share one database with the rest of the package — any other test's BTC
// activity is already in the GL accounts when this one starts.

// setupTreasuryPair funds a KES wallet and converts it to BTC so the house is
// short by a known amount. Mirrors TestIntegrationConvertKESToBTC's shape.
func setupTreasuryPair(t *testing.T, repo *Repository, svc *Service, ctx context.Context, user string) (kesWallet, btcWallet *Wallet, btcLiabilities *big.Int) {
	t.Helper()

	kesWallet, err := repo.EnsureWallet(ctx, user, "KES", "", "", "", "test")
	if err != nil {
		t.Fatal(err)
	}
	btcWallet, err = repo.EnsureWallet(ctx, user, "BTC", "", "", "", "test")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Deposit(ctx, DepositRequest{WalletID: kesWallet.ID, Amount: n(130_000_00), IdempotencyKey: key(t, "dep")}); err != nil {
		t.Fatal(err)
	}

	// 1 KES = 0.00000002 BTC (2 satoshi), no spread: 130,000 KES buys
	// exactly 260,000 sat.
	rate, _ := ParseRate("0.00000002")
	q := &FxQuote{BaseCcy: "KES", QuoteCcy: "BTC", Rate: rate, SpreadBps: 0, Source: "test", ExpiresAt: time.Now().Add(time.Hour)}
	if err := repo.SaveQuote(ctx, q); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Convert(ctx, ConvertRequest{
		FromWalletID: kesWallet.ID, ToWalletID: btcWallet.ID,
		Amount: n(130_000_00), QuoteID: q.ID, IdempotencyKey: key(t, "fx"),
	}); err != nil {
		t.Fatalf("Convert: %v", err)
	}

	return kesWallet, btcWallet, n(260000)
}

// A KES -> BTC conversion puts the house short the full amount the customer
// received: customer liabilities rise, custody is untouched, so
// custody - liabilities is exactly the bought BTC, negative.
func TestTreasuryConversionOpensAShort(t *testing.T) {
	repo, svc, ctx := testRepo(t)
	user := uniqueUser(t)

	liabilitiesBefore := mustSubtreeBalance(t, repo, ctx, GLWalletParent("BTC"))
	custodyBefore := mustBalanceGL(t, repo, ctx, GLCryptoCustody("BTC"))
	fxPosBefore := mustBalanceGL(t, repo, ctx, GLFxPosition("BTC"))

	_, _, btcLiabilities := setupTreasuryPair(t, repo, svc, ctx, user)

	liabilitiesAfter := mustSubtreeBalance(t, repo, ctx, GLWalletParent("BTC"))
	custodyAfter := mustBalanceGL(t, repo, ctx, GLCryptoCustody("BTC"))
	fxPosAfter := mustBalanceGL(t, repo, ctx, GLFxPosition("BTC"))

	if got := new(big.Int).Sub(liabilitiesAfter, liabilitiesBefore); got.Cmp(btcLiabilities) != 0 {
		t.Fatalf("customer BTC liabilities moved by %s, want %s", got, btcLiabilities)
	}
	if got := new(big.Int).Sub(custodyAfter, custodyBefore); got.Sign() != 0 {
		t.Fatalf("custody holdings moved by %s, want 0 (nothing was bought at a custodian)", got)
	}
	// The conversion's BTC leg debited the FX position by the full gross —
	// the house's open exposure, mirrored on the liability side.
	if got := new(big.Int).Sub(fxPosAfter, fxPosBefore); got.Cmp(btcLiabilities) != 0 {
		t.Fatalf("FX position BTC moved by %s, want %s", got, btcLiabilities)
	}

	// net_exposure = custody_holdings - customer_liabilities: the full bought
	// amount, negative — the house is short until treasury buys.
	netBefore := new(big.Int).Sub(custodyBefore, liabilitiesBefore)
	netAfter := new(big.Int).Sub(custodyAfter, liabilitiesAfter)
	if got := new(big.Int).Sub(netAfter, netBefore); got.Cmp(new(big.Int).Neg(btcLiabilities)) != 0 {
		t.Fatalf("net exposure moved by %s, want -%s", got, btcLiabilities)
	}

	assertLedgerHealthy(t, repo, ctx)
}

// A BUY rebalance of exactly the short brings net exposure to zero and moves
// the fiat from the trust bank into the FX position.
func TestTreasuryBuyRebalanceClosesTheShort(t *testing.T) {
	repo, svc, ctx := testRepo(t)
	user := uniqueUser(t)

	_, _, btcLiabilities := setupTreasuryPair(t, repo, svc, ctx, user)
	fiatAmount := n(130_000_00) // the same 130,000 KES the conversion cost

	liabilitiesBefore := mustSubtreeBalance(t, repo, ctx, GLWalletParent("BTC"))
	custodyBefore := mustBalanceGL(t, repo, ctx, GLCryptoCustody("BTC"))
	bankBefore := mustBalanceGL(t, repo, ctx, GLTrustBank("KES"))
	kesFxPosBefore := mustBalanceGL(t, repo, ctx, GLFxPosition("KES"))

	tx, err := svc.TreasuryRebalance(ctx, TreasuryRebalanceRequest{
		Side:           "BUY",
		Currency:       "BTC",
		Amount:         btcLiabilities,
		FiatCurrency:   "KES",
		FiatAmount:     fiatAmount,
		CustodianRef:   "TRADE-1",
		Note:           "closing the demo short",
		IdempotencyKey: key(t, "buy"),
		InitiatedBy:    "rms",
	})
	if err != nil {
		t.Fatalf("TreasuryRebalance BUY: %v", err)
	}
	if tx.Type != TxTreasuryRebal || tx.EntityType != EntityTreasuryRebalance || tx.EntityID != "TRADE-1" {
		t.Fatalf("rebalance stamped %s/%s/%s, want TREASURY_REBALANCE/TREASURY_REBALANCE/TRADE-1",
			tx.Type, tx.EntityType, tx.EntityID)
	}

	// The crypto moved from the FX position into the custody account, so the
	// house now holds exactly what customers are owed and the short is gone.
	if got := new(big.Int).Sub(mustBalanceGL(t, repo, ctx, GLCryptoCustody("BTC")), custodyBefore); got.Cmp(btcLiabilities) != 0 {
		t.Fatalf("custody holdings moved by %s, want %s", got, btcLiabilities)
	}
	liabilitiesAfter := mustSubtreeBalance(t, repo, ctx, GLWalletParent("BTC"))
	if got := new(big.Int).Sub(liabilitiesAfter, liabilitiesBefore); got.Sign() != 0 {
		t.Fatalf("customer liabilities moved by %s, want 0 (a rebalance trades the house's own position)", got)
	}
	netAfter := new(big.Int).Sub(mustBalanceGL(t, repo, ctx, GLCryptoCustody("BTC")), liabilitiesAfter)
	netBefore := new(big.Int).Sub(custodyBefore, liabilitiesBefore)
	if got := new(big.Int).Sub(netAfter, netBefore); got.Cmp(btcLiabilities) != 0 {
		t.Fatalf("net exposure moved by %s, want +%s (short closed)", got, btcLiabilities)
	}

	// The fiat leg: the trust bank paid the trade out and the KES FX
	// position absorbed it — the exact inverse of the conversion's KES leg.
	if got := new(big.Int).Sub(bankBefore, mustBalanceGL(t, repo, ctx, GLTrustBank("KES"))); got.Cmp(fiatAmount) != 0 {
		t.Fatalf("trust bank KES moved by %s, want -%s", got, fiatAmount)
	}
	if got := new(big.Int).Sub(mustBalanceGL(t, repo, ctx, GLFxPosition("KES")), kesFxPosBefore); got.Cmp(fiatAmount) != 0 {
		t.Fatalf("FX position KES moved by %s, want +%s", got, fiatAmount)
	}

	assertLedgerHealthy(t, repo, ctx)
}

// SELL is BUY's mirror: custody hands the crypto back out, the FX position
// reopens, and the fiat returns to the trust bank.
func TestTreasurySellRebalanceReopensTheShort(t *testing.T) {
	repo, svc, ctx := testRepo(t)
	user := uniqueUser(t)

	_, _, btcLiabilities := setupTreasuryPair(t, repo, svc, ctx, user)
	fiatAmount := n(130_000_00)

	// First close the short so there is custody crypto to sell.
	if _, err := svc.TreasuryRebalance(ctx, TreasuryRebalanceRequest{
		Side: "BUY", Currency: "BTC", Amount: btcLiabilities,
		FiatCurrency: "KES", FiatAmount: fiatAmount, CustodianRef: "TRADE-1",
		IdempotencyKey: key(t, "buy"), InitiatedBy: "rms",
	}); err != nil {
		t.Fatalf("TreasuryRebalance BUY: %v", err)
	}

	custodyBefore := mustBalanceGL(t, repo, ctx, GLCryptoCustody("BTC"))
	fxPosBefore := mustBalanceGL(t, repo, ctx, GLFxPosition("BTC"))
	bankBefore := mustBalanceGL(t, repo, ctx, GLTrustBank("KES"))

	if _, err := svc.TreasuryRebalance(ctx, TreasuryRebalanceRequest{
		Side: "SELL", Currency: "BTC", Amount: btcLiabilities,
		FiatCurrency: "KES", FiatAmount: fiatAmount, CustodianRef: "TRADE-2",
		IdempotencyKey: key(t, "sell"), InitiatedBy: "rms",
	}); err != nil {
		t.Fatalf("TreasuryRebalance SELL: %v", err)
	}

	if got := new(big.Int).Sub(custodyBefore, mustBalanceGL(t, repo, ctx, GLCryptoCustody("BTC"))); got.Cmp(btcLiabilities) != 0 {
		t.Fatalf("custody holdings moved by %s, want -%s", got, btcLiabilities)
	}
	if got := new(big.Int).Sub(mustBalanceGL(t, repo, ctx, GLFxPosition("BTC")), fxPosBefore); got.Cmp(btcLiabilities) != 0 {
		t.Fatalf("FX position BTC moved by %s, want +%s (short reopened)", got, btcLiabilities)
	}
	if got := new(big.Int).Sub(mustBalanceGL(t, repo, ctx, GLTrustBank("KES")), bankBefore); got.Cmp(fiatAmount) != 0 {
		t.Fatalf("trust bank KES moved by %s, want +%s (fiat returned)", got, fiatAmount)
	}

	assertLedgerHealthy(t, repo, ctx)
}

func TestTreasuryRebalanceValidation(t *testing.T) {
	repo, svc, ctx := testRepo(t)
	user := uniqueUser(t)

	_, _, btcLiabilities := setupTreasuryPair(t, repo, svc, ctx, user)

	valid := func(side string) TreasuryRebalanceRequest {
		return TreasuryRebalanceRequest{
			Side: side, Currency: "BTC", Amount: btcLiabilities,
			FiatCurrency: "KES", FiatAmount: n(130_000_00),
			IdempotencyKey: key(t, "v-"+side), InitiatedBy: "rms",
		}
	}

	cases := []struct {
		name string
		mut  func(*TreasuryRebalanceRequest)
		code string
	}{
		{
			name: "unknown side",
			mut:  func(r *TreasuryRebalanceRequest) { r.Side = "HOLD" },
			code: "INVALID_REBALANCE_SIDE",
		},
		{
			name: "empty side",
			mut:  func(r *TreasuryRebalanceRequest) { r.Side = "" },
			code: "INVALID_REBALANCE_SIDE",
		},
		{
			name: "fiat as the crypto leg",
			mut:  func(r *TreasuryRebalanceRequest) { r.Currency = "USD" },
			code: "NOT_CUSTODIAL_CRYPTO",
		},
		{
			name: "usdx as the crypto leg",
			mut:  func(r *TreasuryRebalanceRequest) { r.Currency = USDXCode },
			code: "NOT_CUSTODIAL_CRYPTO",
		},
		{
			name: "crypto as the fiat leg",
			mut:  func(r *TreasuryRebalanceRequest) { r.FiatCurrency = "BTC" },
			code: "NOT_A_FIAT_CURRENCY",
		},
		{
			name: "unknown currency",
			mut:  func(r *TreasuryRebalanceRequest) { r.Currency = "DOGE" },
			code: "UNKNOWN_CURRENCY",
		},
		{
			name: "zero crypto amount",
			mut:  func(r *TreasuryRebalanceRequest) { r.Amount = big.NewInt(0) },
			code: "NON_POSITIVE_AMOUNT",
		},
		{
			name: "zero fiat amount",
			mut:  func(r *TreasuryRebalanceRequest) { r.FiatAmount = big.NewInt(0) },
			code: "NON_POSITIVE_AMOUNT",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := valid("BUY")
			tc.mut(&req)
			_, err := svc.TreasuryRebalance(ctx, req)
			wantCode(t, err, tc.code)
		})
	}

	// The floors on the real asset accounts: a SELL delivers more crypto
	// than the custodian holds, and a BUY pays more fiat than the trust bank
	// holds. Both must be refused inside the posting transaction, exactly
	// like an overdrawn wallet. The overage is relative to each account's
	// current balance — the shared test database keeps every run's postings,
	// so no absolute figure is stable.
	t.Run("sell more than custody holds", func(t *testing.T) {
		held := mustBalanceGL(t, repo, ctx, GLCryptoCustody("BTC"))
		req := valid("SELL")
		req.Amount = new(big.Int).Add(held, big.NewInt(1))
		_, err := svc.TreasuryRebalance(ctx, req)
		wantCode(t, err, "INSUFFICIENT_FUNDS")
	})
	t.Run("buy with more fiat than the trust bank holds", func(t *testing.T) {
		held := mustBalanceGL(t, repo, ctx, GLTrustBank("KES"))
		req := valid("BUY")
		req.FiatAmount = new(big.Int).Add(held, big.NewInt(1))
		_, err := svc.TreasuryRebalance(ctx, req)
		wantCode(t, err, "INSUFFICIENT_FUNDS")
	})

	assertLedgerHealthy(t, repo, ctx)
}

// A retried rebalance replays the first call rather than trading twice — the
// guarantee rms' deterministic Idempotency-Key leans on.
func TestTreasuryRebalanceIdempotency(t *testing.T) {
	repo, svc, ctx := testRepo(t)
	user := uniqueUser(t)

	_, _, btcLiabilities := setupTreasuryPair(t, repo, svc, ctx, user)
	k := key(t, "buy")

	req := TreasuryRebalanceRequest{
		Side: "BUY", Currency: "BTC", Amount: btcLiabilities,
		FiatCurrency: "KES", FiatAmount: n(130_000_00),
		IdempotencyKey: k, InitiatedBy: "rms",
	}
	first, err := svc.TreasuryRebalance(ctx, req)
	if err != nil {
		t.Fatal(err)
	}
	second, err := svc.TreasuryRebalance(ctx, req)
	if err != nil {
		t.Fatal(err)
	}
	if first.ID != second.ID {
		t.Fatalf("retry created a second transaction: %s then %s", first.ID, second.ID)
	}
}

func mustSubtreeBalance(t *testing.T, repo *Repository, ctx context.Context, glCode string) *big.Int {
	t.Helper()
	b, err := repo.SubtreeBalance(ctx, glCode)
	if err != nil {
		t.Fatal(err)
	}
	return b
}
