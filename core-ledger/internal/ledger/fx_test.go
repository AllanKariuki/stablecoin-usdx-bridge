package ledger

import (
	"math/big"
	"testing"
	"time"
)

var (
	usd  = Currency{Code: "USD", Kind: CurrencyFiat, Decimals: 2}
	kes  = Currency{Code: "KES", Kind: CurrencyFiat, Decimals: 2}
	usdx = Currency{Code: USDXCode, Kind: CurrencyCrypto, Decimals: 6}
)

func quote(base, quoteCcy, rate string, spreadBps int32, t *testing.T) *FxQuote {
	t.Helper()
	r, err := ParseRate(rate)
	if err != nil {
		t.Fatalf("ParseRate(%q): %v", rate, err)
	}
	return &FxQuote{ID: "q", BaseCcy: base, QuoteCcy: quoteCcy, Rate: r, SpreadBps: spreadBps}
}

func TestConvertAppliesRateAndSpread(t *testing.T) {
	// 130,000.00 KES at 1 KES = 0.0076923 USD... expressed the way the quote
	// reads: 1 KES = 0.007692307692307692 USD, 50 bps spread.
	q := quote("KES", "USD", "0.007692307692307692", 50, t)
	conv := Convert(q, n(130_000_00), kes, usd)

	if got := conv.Gross.String(); got != "99999" {
		t.Errorf("gross = %s, want 99999 (999.99 USD)", got)
	}
	if got := conv.Fee.String(); got != "499" {
		t.Errorf("fee = %s, want 499 (50bps of 999.99)", got)
	}
	if got := conv.Net.String(); got != "99500" {
		t.Errorf("net = %s, want 99500", got)
	}
	// The invariant the journal depends on: the quote-side leg only balances
	// if the house's cut and the user's proceeds add back up to the gross.
	if sum := new(big.Int).Add(conv.Net, conv.Fee); sum.Cmp(conv.Gross) != 0 {
		t.Errorf("net + fee = %s, must equal gross %s or the USD leg cannot balance", sum, conv.Gross)
	}
}

// The peg is 1:1 in value but 2 decimals vs 6 in representation. Getting this
// wrong is a four-order-of-magnitude error, which is why issuance routes
// through Convert rather than assigning the amount across.
func TestConvertRescalesAcrossThePeg(t *testing.T) {
	conv := Convert(PegQuote("USD", USDXCode), n(100_00), usd, usdx)
	if got := conv.Net.String(); got != "100000000" {
		t.Fatalf("100.00 USD should be 100.000000 USD-X (100000000), got %s", got)
	}

	back := Convert(PegQuote(USDXCode, "USD"), conv.Net, usdx, usd)
	if got := back.Net.String(); got != "10000" {
		t.Fatalf("round trip should return 100.00 USD (10000), got %s", got)
	}
}

// Multiplying before dividing is what keeps a rate exact; truncating an
// intermediate would lose value on every conversion.
func TestConvertDoesNotTruncateIntermediates(t *testing.T) {
	q := quote("USD", "KES", "129.5", 0, t)
	conv := Convert(q, n(1), usd, kes) // one cent

	if got := conv.Gross.String(); got != "129" {
		t.Fatalf("0.01 USD at 129.5 is 1.295 KES -> 129 (truncated once, at the end), got %s", got)
	}
}

func TestConvertRoundsTowardZeroSoNothingIsInvented(t *testing.T) {
	q := quote("USD", "KES", "130.007", 0, t)
	conv := Convert(q, n(3), usd, kes) // 0.03 USD -> 3.90021 KES

	if got := conv.Gross.String(); got != "390" {
		t.Fatalf("expected 390 (3.90 KES, remainder left in the FX position), got %s", got)
	}
}

func TestApplyBps(t *testing.T) {
	cases := []struct {
		amount int64
		bps    int32
		want   string
	}{
		{100_00, 50, "50"}, // 0.50 on 100.00
		{100_00, 0, "0"},   // no fee configured
		{100_00, -10, "0"}, // a negative fee would be a rebate; refuse it
		{99, 50, "0"},      // sub-minor-unit fee truncates down, never up
		{1_000_000_00, 10, "100000"},
	}
	for _, c := range cases {
		if got := ApplyBps(n(c.amount), c.bps).String(); got != c.want {
			t.Errorf("ApplyBps(%d, %d) = %s, want %s", c.amount, c.bps, got, c.want)
		}
	}
}

func TestUsableQuoteRejectsTheWrongPairAndStaleRates(t *testing.T) {
	now := time.Date(2026, 9, 18, 12, 0, 0, 0, time.UTC)
	q := quote("KES", "USD", "0.0077", 50, t)
	q.ExpiresAt = now.Add(-time.Minute)

	wantCode(t, UsableQuote(q, "KES", "USD", now), "QUOTE_EXPIRED")

	q.ExpiresAt = now.Add(time.Minute)
	if err := UsableQuote(q, "KES", "USD", now); err != nil {
		t.Fatalf("a live KES/USD quote should be usable for KES->USD, got %v", err)
	}

	// Inverting a spread-bearing rate would charge the spread backwards, so a
	// USD->KES conversion needs its own quote rather than this one flipped.
	wantCode(t, UsableQuote(q, "USD", "KES", now), "QUOTE_PAIR_MISMATCH")
	wantCode(t, UsableQuote(nil, "KES", "USD", now), "MISSING_QUOTE")
}

func TestDecimalRoundTripsAtEachCurrencyScale(t *testing.T) {
	cases := []struct {
		in       string
		currency Currency
		want     string
	}{
		{"10.00", usd, "1000"},
		{"10", usd, "1000"},
		{"10.00", usdx, "10000000"},
		{"0.000001", usdx, "1"},
		{"130000.00", kes, "13000000"},
	}
	for _, c := range cases {
		got, err := DecimalAmount{Raw: c.in}.In(&c.currency)
		if err != nil {
			t.Fatalf("%q in %s: %v", c.in, c.currency.Code, err)
		}
		if got.String() != c.want {
			t.Errorf("%q in %s = %s, want %s", c.in, c.currency.Code, got, c.want)
		}
		if back := FormatDecimal(got, c.currency.Decimals); back != normalize(c.in, c.currency.Decimals) {
			t.Errorf("FormatDecimal(%s, %d) = %s, want %s", got, c.currency.Decimals, back, normalize(c.in, c.currency.Decimals))
		}
	}
}

// An amount with more precision than its currency has is rejected rather than
// truncated: "10.001" USD is a client bug, and silently booking 10.00 hides it.
func TestAmountRejectsMorePrecisionThanTheCurrencyHas(t *testing.T) {
	if _, err := (DecimalAmount{Raw: "10.001"}).In(&usd); err == nil {
		t.Fatal("expected 10.001 USD to be rejected: USD has 2 decimal places")
	}
	if _, err := (DecimalAmount{Raw: "10.001"}).In(&usdx); err != nil {
		t.Fatalf("10.001 is fine in USD-X (6 places), got %v", err)
	}
}

func TestFormatDecimalHandlesSmallAndNegativeValues(t *testing.T) {
	cases := []struct {
		v        int64
		decimals int32
		want     string
	}{
		{1, 6, "0.000001"},
		{0, 2, "0.00"},
		{-1050, 2, "-10.50"},
		{5, 0, "5"},
	}
	for _, c := range cases {
		if got := FormatDecimal(n(c.v), c.decimals); got != c.want {
			t.Errorf("FormatDecimal(%d, %d) = %q, want %q", c.v, c.decimals, got, c.want)
		}
	}
}

// normalize renders the expected round-trip form of an input literal.
func normalize(in string, decimals int32) string {
	v, err := ParseDecimal(in, decimals)
	if err != nil {
		return in
	}
	return FormatDecimal(v, decimals)
}
