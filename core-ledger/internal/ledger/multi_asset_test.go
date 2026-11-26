package ledger

import (
	"testing"
	"time"
)

// Multi-asset integration tests: custodial crypto wallets, crypto<->fiat
// conversion, the cross-owner pay-with-conversion flow, and per-currency
// default wallets. They run against a real PostgreSQL for the same reason
// the other integration tests do — the parts worth doubting are the
// migrations, the SERIALIZABLE posting transaction and the running-balance
// read, all of which a fake would paper over.

// Custodial crypto wallets get their native chain by default, refuse both a
// user-supplied address and a foreign chain, and leave the USD-X rules
// exactly where they were.
func TestIntegrationCustodialCryptoWallets(t *testing.T) {
	repo, _, ctx := testRepo(t)
	user := uniqueUser(t)

	btcWallet, err := repo.EnsureWallet(ctx, user, "BTC", "", "", "", "test")
	if err != nil {
		t.Fatalf("EnsureWallet(BTC): %v", err)
	}
	if btcWallet.Chain != "BITCOIN" {
		t.Fatalf("BTC wallet chain = %q, want BITCOIN (defaulted)", btcWallet.Chain)
	}
	if btcWallet.Address != "" {
		t.Fatalf("BTC wallet address = %q, want empty: the platform custodies it", btcWallet.Address)
	}
	if btcWallet.IsDefault {
		t.Fatal("a fresh wallet must not be the default; the user picks one explicitly")
	}

	// Naming the native chain explicitly lands on the same wallet: BTC has
	// exactly one chain, so both spellings name the same thing.
	same, err := repo.EnsureWallet(ctx, user, "BTC", "BITCOIN", "", "", "test")
	if err != nil {
		t.Fatalf("EnsureWallet(BTC, BITCOIN): %v", err)
	}
	if same.ID != btcWallet.ID {
		t.Fatal("naming BITCOIN explicitly should return the wallet the default created")
	}

	// The user's own address is refused: the platform holds the keys, and a
	// wallet stamped with a user address is one no flow could ever settle.
	_, err = repo.EnsureWallet(ctx, user, "BTC", "", "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh", "", "test")
	wantCode(t, err, "UNEXPECTED_ADDRESS")

	// A non-native chain is refused: ETH lives on Ethereum only.
	_, err = repo.EnsureWallet(ctx, user, "ETH", "SOLANA", "", "", "test")
	wantCode(t, err, "WRONG_CHAIN")

	// ETH and SOL default to their own chains.
	ethWallet, err := repo.EnsureWallet(ctx, user, "ETH", "", "", "", "test")
	if err != nil {
		t.Fatalf("EnsureWallet(ETH): %v", err)
	}
	if ethWallet.Chain != "ETHEREUM" {
		t.Fatalf("ETH wallet chain = %q, want ETHEREUM", ethWallet.Chain)
	}
	solWallet, err := repo.EnsureWallet(ctx, user, "SOL", "", "", "", "test")
	if err != nil {
		t.Fatalf("EnsureWallet(SOL): %v", err)
	}
	if solWallet.Chain != "SOLANA" {
		t.Fatalf("SOL wallet chain = %q, want SOLANA", solWallet.Chain)
	}

	// USD-X keeps its existing rules: the chain is required and the address
	// is validated, because the user really does hold USD-X on-chain.
	_, err = repo.EnsureWallet(ctx, user, USDXCode, "", "", "", "test")
	wantCode(t, err, "MISSING_CHAIN")
}

// A KES -> BTC conversion works end to end: the payer's KES leaves their
// wallet, the satoshis land, and both currencies still balance on their own.
func TestIntegrationConvertKESToBTC(t *testing.T) {
	repo, svc, ctx := testRepo(t)
	user := uniqueUser(t)

	kesWallet, err := repo.EnsureWallet(ctx, user, "KES", "", "", "", "test")
	if err != nil {
		t.Fatal(err)
	}
	btcWallet, err := repo.EnsureWallet(ctx, user, "BTC", "", "", "", "test")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Deposit(ctx, DepositRequest{WalletID: kesWallet.ID, Amount: n(130_000_00), IdempotencyKey: key(t, "dep")}); err != nil {
		t.Fatal(err)
	}

	// 1 KES = 0.00000002 BTC (2 satoshi), no spread, so 130,000 KES is
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

	balanceOf(t, repo, ctx, kesWallet.AccountID, "0")
	balanceOf(t, repo, ctx, btcWallet.AccountID, "260000")

	// Both currencies still balance on their own even though the transaction
	// spans two of them.
	assertLedgerHealthy(t, repo, ctx)
	for _, ccy := range []string{"KES", "BTC"} {
		tb, err := repo.TrialBalance(ctx, ccy, time.Time{})
		if err != nil {
			t.Fatal(err)
		}
		if !tb.Balanced {
			t.Errorf("%s trial balance is out: debits %s credits %s", ccy, tb.TotalDebits, tb.TotalCredits)
		}
	}
}

// USD-X crosses into other currencies through issuance/redemption, never
// through FX, in both directions.
func TestIntegrationConvertRejectsUSDXPair(t *testing.T) {
	repo, svc, ctx := testRepo(t)
	user := uniqueUser(t)

	usdWallet, err := repo.EnsureWallet(ctx, user, "USD", "", "", "", "test")
	if err != nil {
		t.Fatal(err)
	}
	usdxWallet, err := repo.EnsureWallet(ctx, user, USDXCode, "ETHEREUM", "0x00000000000000000000000000000000000000E1", "", "test")
	if err != nil {
		t.Fatal(err)
	}

	rate, _ := ParseRate("1")
	q := &FxQuote{BaseCcy: "USD", QuoteCcy: USDXCode, Rate: rate, SpreadBps: 0, Source: "test", ExpiresAt: time.Now().Add(time.Hour)}
	if err := repo.SaveQuote(ctx, q); err != nil {
		t.Fatal(err)
	}

	_, err = svc.Convert(ctx, ConvertRequest{
		FromWalletID: usdWallet.ID, ToWalletID: usdxWallet.ID,
		Amount: n(100_00), QuoteID: q.ID, IdempotencyKey: key(t, "fx"),
	})
	wantCode(t, err, "USDX_USES_ISSUANCE")

	_, err = svc.PayConverted(ctx, PayConvertedRequest{
		FromWalletID: usdxWallet.ID, ToWalletID: usdWallet.ID,
		Amount: n(100_000000), QuoteID: q.ID, IdempotencyKey: key(t, "pay"),
	})
	wantCode(t, err, "USDX_USES_ISSUANCE")
}

// PayConverted is the cross-owner conversion: user A's BTC leaves their
// wallet and user B's KES wallet is credited the net of the spread. The
// retry guarantee, overdraft protection and the frozen-payee rule all hold.
func TestIntegrationPayConverted(t *testing.T) {
	repo, svc, ctx := testRepo(t)
	payer, payee := uniqueUser(t), uniqueUser(t)

	// Fund the payer the way the ledger itself can: fiat deposit, then a
	// KES -> BTC conversion — crypto<->fiat conversion is exactly what this
	// change opens up.
	payerKES, err := repo.EnsureWallet(ctx, payer, "KES", "", "", "", "test")
	if err != nil {
		t.Fatal(err)
	}
	payerBTC, err := repo.EnsureWallet(ctx, payer, "BTC", "", "", "", "test")
	if err != nil {
		t.Fatal(err)
	}
	payeeKES, err := repo.EnsureWallet(ctx, payee, "KES", "", "", "", "test")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Deposit(ctx, DepositRequest{WalletID: payerKES.ID, Amount: n(130_000_00), IdempotencyKey: key(t, "dep")}); err != nil {
		t.Fatal(err)
	}
	rate, _ := ParseRate("0.00000002")
	q1 := &FxQuote{BaseCcy: "KES", QuoteCcy: "BTC", Rate: rate, SpreadBps: 0, Source: "test", ExpiresAt: time.Now().Add(time.Hour)}
	if err := repo.SaveQuote(ctx, q1); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Convert(ctx, ConvertRequest{
		FromWalletID: payerKES.ID, ToWalletID: payerBTC.ID,
		Amount: n(130_000_00), QuoteID: q1.ID, IdempotencyKey: key(t, "fx"),
	}); err != nil {
		t.Fatal(err)
	}
	balanceOf(t, repo, ctx, payerBTC.AccountID, "260000")

	// The payment itself: 0.001 BTC at 1 BTC = 15,000,000 KES, 50 bps.
	rate, _ = ParseRate("15000000")
	q2 := &FxQuote{BaseCcy: "BTC", QuoteCcy: "KES", Rate: rate, SpreadBps: 50, Source: "test", ExpiresAt: time.Now().Add(time.Hour)}
	if err := repo.SaveQuote(ctx, q2); err != nil {
		t.Fatal(err)
	}

	// A quote is single-use, so each distinct attempt below gets its own
	// (the idempotent retry above is the one caller that may reuse q2, and it
	// returns the original transaction without touching the index).
	freshQuote := func() *FxQuote {
		rate, _ := ParseRate("15000000")
		q := &FxQuote{BaseCcy: "BTC", QuoteCcy: "KES", Rate: rate, SpreadBps: 0, Source: "test", ExpiresAt: time.Now().Add(time.Hour)}
		if err := repo.SaveQuote(ctx, q); err != nil {
			t.Fatal(err)
		}
		return q
	}

	btcPosBefore := mustBalanceGL(t, repo, ctx, GLFxPosition("BTC"))
	kesPosBefore := mustBalanceGL(t, repo, ctx, GLFxPosition("KES"))
	spreadBefore := mustBalanceGL(t, repo, ctx, GLFxSpread("KES"))

	req := PayConvertedRequest{
		FromWalletID: payerBTC.ID, ToWalletID: payeeKES.ID,
		Amount: n(100_000), QuoteID: q2.ID, IdempotencyKey: key(t, "pay"), InitiatedBy: "svc-payments",
	}
	tx, err := svc.PayConverted(ctx, req)
	if err != nil {
		t.Fatalf("PayConverted: %v", err)
	}
	if tx.Type != TxFXPayment {
		t.Errorf("type = %s, want %s", tx.Type, TxFXPayment)
	}
	if got := tx.Metadata["payee_user_id"]; got != payee {
		t.Errorf("metadata payee_user_id = %v, want %s", got, payee)
	}

	// 100,000 sat -> 15,000.00 KES gross, 50bps spread = 75.00 KES fee,
	// 14,925.00 KES net.
	balanceOf(t, repo, ctx, payerBTC.AccountID, "160000")
	balanceOf(t, repo, ctx, payeeKES.AccountID, "1492500")
	assertDelta(t, repo, ctx, GLFxPosition("BTC"), btcPosBefore, "-100000")
	assertDelta(t, repo, ctx, GLFxPosition("KES"), kesPosBefore, "1500000")
	assertDelta(t, repo, ctx, GLFxSpread("KES"), spreadBefore, "7500")

	// A retried request returns the original transaction, not a second set
	// of entries.
	second, err := svc.PayConverted(ctx, req)
	if err != nil {
		t.Fatalf("PayConverted retry: %v", err)
	}
	if second.ID != tx.ID {
		t.Fatalf("retry created a second transaction: %s then %s", tx.ID, second.ID)
	}
	balanceOf(t, repo, ctx, payerBTC.AccountID, "160000")

	// Same currency is a transfer's job, not a payment's.
	_, err = svc.PayConverted(ctx, PayConvertedRequest{
		FromWalletID: payerKES.ID, ToWalletID: payeeKES.ID,
		Amount: n(10_00), QuoteID: q2.ID, IdempotencyKey: key(t, "same"),
	})
	wantCode(t, err, "SAME_CURRENCY")

	// The payer cannot spend what they no longer hold.
	_, err = svc.PayConverted(ctx, PayConvertedRequest{
		FromWalletID: payerBTC.ID, ToWalletID: payeeKES.ID,
		Amount: n(200_000), QuoteID: freshQuote().ID, IdempotencyKey: key(t, "over"),
	})
	wantCode(t, err, "INSUFFICIENT_FUNDS")

	// A frozen payee is refused — the posting engine enforces the freeze
	// through the payee's account, which SetWalletStatus froze with it.
	if err := repo.SetWalletStatus(ctx, payeeKES.ID, WalletFrozen, "compliance"); err != nil {
		t.Fatal(err)
	}
	_, err = svc.PayConverted(ctx, PayConvertedRequest{
		FromWalletID: payerBTC.ID, ToWalletID: payeeKES.ID,
		Amount: n(10_000), QuoteID: freshQuote().ID, IdempotencyKey: key(t, "frozen"),
	})
	wantCode(t, err, "ACCOUNT_FROZEN")

	assertLedgerHealthy(t, repo, ctx)
}

// SetDefaultWallet keeps at most one default per (user, currency): setting a
// new one clears the old, which is the only user-visible case today (USD-X
// on two chains) and the shape every future currency with variants gets.
func TestIntegrationDefaultWallet(t *testing.T) {
	repo, _, ctx := testRepo(t)
	user := uniqueUser(t)

	ethWallet, err := repo.EnsureWallet(ctx, user, USDXCode, "ETHEREUM", "0x00000000000000000000000000000000000000E1", "", "test")
	if err != nil {
		t.Fatal(err)
	}
	solWallet, err := repo.EnsureWallet(ctx, user, USDXCode, "SOLANA", "So11111111111111111111111111111111111111112", "", "test")
	if err != nil {
		t.Fatal(err)
	}

	if err := repo.SetDefaultWallet(ctx, solWallet.ID, "bff"); err != nil {
		t.Fatalf("SetDefaultWallet: %v", err)
	}
	if got, _ := repo.Wallet(ctx, solWallet.ID); !got.IsDefault {
		t.Fatal("the wallet just set as default does not read back as default")
	}
	if got, _ := repo.Wallet(ctx, ethWallet.ID); got.IsDefault {
		t.Fatal("the other wallet in the same currency should still be non-default")
	}

	// Setting the other default flips the flag rather than stacking.
	if err := repo.SetDefaultWallet(ctx, ethWallet.ID, "bff"); err != nil {
		t.Fatalf("SetDefaultWallet (flip): %v", err)
	}
	if got, _ := repo.Wallet(ctx, ethWallet.ID); !got.IsDefault {
		t.Fatal("the new default does not read back as default")
	}
	if got, _ := repo.Wallet(ctx, solWallet.ID); got.IsDefault {
		t.Fatal("setting a new default must clear the old one")
	}

	// Labels move with the wallet metadata, not the money.
	if err := repo.UpdateWalletLabel(ctx, solWallet.ID, "Spending", "bff"); err != nil {
		t.Fatalf("UpdateWalletLabel: %v", err)
	}
	if got, _ := repo.Wallet(ctx, solWallet.ID); got.Label != "Spending" {
		t.Fatalf("label = %q, want %q", got.Label, "Spending")
	}
}

// A quote is consumed by exactly one conversion or payment. The partial
// unique index on transactions(fx_quote_id) enforces it inside the posting
// transaction, so a second use is refused no matter who asks or how.
func TestIntegrationQuoteIsSingleUse(t *testing.T) {
	repo, svc, ctx := testRepo(t)
	user := uniqueUser(t)

	kesWallet, err := repo.EnsureWallet(ctx, user, "KES", "", "", "", "test")
	if err != nil {
		t.Fatal(err)
	}
	usdWallet, err := repo.EnsureWallet(ctx, user, "USD", "", "", "", "test")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Deposit(ctx, DepositRequest{WalletID: kesWallet.ID, Amount: n(200_00), IdempotencyKey: key(t, "dep")}); err != nil {
		t.Fatal(err)
	}

	rate, _ := ParseRate("0.0077")
	q := &FxQuote{BaseCcy: "KES", QuoteCcy: "USD", Rate: rate, SpreadBps: 0, Source: "test", ExpiresAt: time.Now().Add(time.Hour)}
	if err := repo.SaveQuote(ctx, q); err != nil {
		t.Fatal(err)
	}

	req := ConvertRequest{
		FromWalletID: kesWallet.ID, ToWalletID: usdWallet.ID,
		Amount: n(100_00), QuoteID: q.ID, IdempotencyKey: key(t, "fx"),
	}
	first, err := svc.Convert(ctx, req)
	if err != nil {
		t.Fatalf("Convert: %v", err)
	}

	// A retry with the same idempotency key returns the original, not a
	// QUOTE_ALREADY_USED refusal: the idempotency lookup runs before any
	// insert, so the retry never touches the single-use index.
	second, err := svc.Convert(ctx, req)
	if err != nil {
		t.Fatalf("idempotent replay: %v", err)
	}
	if second.ID != first.ID {
		t.Fatalf("retry created a second transaction: %s then %s", first.ID, second.ID)
	}

	// A genuinely new use of the consumed quote is refused.
	_, err = svc.Convert(ctx, ConvertRequest{
		FromWalletID: kesWallet.ID, ToWalletID: usdWallet.ID,
		Amount: n(100_00), QuoteID: q.ID, IdempotencyKey: key(t, "fx2"),
	})
	wantCode(t, err, "QUOTE_ALREADY_USED")

	// A payment is refused on the same consumed quote too.
	payeeUSD, err := repo.EnsureWallet(ctx, uniqueUser(t), "USD", "", "", "", "test")
	if err != nil {
		t.Fatal(err)
	}
	_, err = svc.PayConverted(ctx, PayConvertedRequest{
		FromWalletID: kesWallet.ID, ToWalletID: payeeUSD.ID,
		Amount: n(50_00), QuoteID: q.ID, IdempotencyKey: key(t, "pay"),
	})
	wantCode(t, err, "QUOTE_ALREADY_USED")
}

// Reversing an FX conversion must still post: the reversal copies the
// conversion's fx_quote_id but uses type REVERSAL, which the single-use index
// deliberately excludes — otherwise correcting a bad conversion would itself
// be refused and the wrong entry would be unfixable.
func TestIntegrationReversalOfFXConversionStillPosts(t *testing.T) {
	repo, svc, ctx := testRepo(t)
	user := uniqueUser(t)

	kesWallet, err := repo.EnsureWallet(ctx, user, "KES", "", "", "", "test")
	if err != nil {
		t.Fatal(err)
	}
	usdWallet, err := repo.EnsureWallet(ctx, user, "USD", "", "", "", "test")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Deposit(ctx, DepositRequest{WalletID: kesWallet.ID, Amount: n(100_00), IdempotencyKey: key(t, "dep")}); err != nil {
		t.Fatal(err)
	}

	rate, _ := ParseRate("0.0077")
	q := &FxQuote{BaseCcy: "KES", QuoteCcy: "USD", Rate: rate, SpreadBps: 0, Source: "test", ExpiresAt: time.Now().Add(time.Hour)}
	if err := repo.SaveQuote(ctx, q); err != nil {
		t.Fatal(err)
	}

	conv, err := svc.Convert(ctx, ConvertRequest{
		FromWalletID: kesWallet.ID, ToWalletID: usdWallet.ID,
		Amount: n(100_00), QuoteID: q.ID, IdempotencyKey: key(t, "fx"),
	})
	if err != nil {
		t.Fatalf("Convert: %v", err)
	}
	balanceOf(t, repo, ctx, kesWallet.AccountID, "0")
	balanceOf(t, repo, ctx, usdWallet.AccountID, "77")

	if _, err := repo.Reverse(ctx, conv.ID, "wrong rate", "ops", ""); err != nil {
		t.Fatalf("reversing an FX conversion must still post: %v", err)
	}
	balanceOf(t, repo, ctx, kesWallet.AccountID, "10000")
	balanceOf(t, repo, ctx, usdWallet.AccountID, "0")
	assertLedgerHealthy(t, repo, ctx)
}
