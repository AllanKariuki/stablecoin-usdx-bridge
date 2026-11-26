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
	eth  = Currency{Code: "ETH", Kind: CurrencyCrypto, Decimals: 18}
	btc  = Currency{Code: "BTC", Kind: CurrencyCrypto, Decimals: 8}
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

// The 18-decimal ETH -> 2-decimal USD hop is the widest scale change a
// conversion can make. The single division must land exactly on a round
// dollar amount, and the spread must come out of the proceeds so net + fee
// still equals gross — the invariant the journal's USD leg depends on.
func TestConvertCryptoToFiatExactness(t *testing.T) {
	// 1 ETH at 3,500.00 USD, 25 bps spread.
	q := quote("ETH", "USD", "3500", 25, t)
	conv := Convert(q, pow10(18), eth, usd)

	if got := conv.Gross.String(); got != "350000" {
		t.Errorf("gross = %s, want 350000 (3500.00 USD)", got)
	}
	if got := conv.Fee.String(); got != "875" {
		t.Errorf("fee = %s, want 875 (25bps of 3500.00)", got)
	}
	if got := conv.Net.String(); got != "349125" {
		t.Errorf("net = %s, want 349125", got)
	}
	if sum := new(big.Int).Add(conv.Net, conv.Fee); sum.Cmp(conv.Gross) != 0 {
		t.Errorf("net + fee = %s, must equal gross %s or the USD leg cannot balance", sum, conv.Gross)
	}
}

// USD -> BTC at 8 decimals: 100.00 USD at 1 USD = 0.00001 BTC is exactly
// 100,000 satoshis before the spread.
func TestConvertFiatToBTCExactness(t *testing.T) {
	q := quote("USD", "BTC", "0.00001", 10, t)
	conv := Convert(q, n(100_00), usd, btc)

	if got := conv.Gross.String(); got != "100000" {
		t.Errorf("gross = %s, want 100000 (0.001 BTC)", got)
	}
	if got := conv.Fee.String(); got != "100" {
		t.Errorf("fee = %s, want 100 (10bps of 100000 sat)", got)
	}
	if got := conv.Net.String(); got != "99900" {
		t.Errorf("net = %s, want 99900", got)
	}
	if sum := new(big.Int).Add(conv.Net, conv.Fee); sum.Cmp(conv.Gross) != 0 {
		t.Errorf("net + fee = %s, must equal gross %s or the BTC leg cannot balance", sum, conv.Gross)
	}
}

// A sub-satoshi residue is truncated, not rounded up: the fractional amount
// stays in the FX position rather than being invented for the user.
func TestConvertResidueTruncatesAtTheEnd(t *testing.T) {
	// 1 USD cent at 1 USD = 0.000012345678901234 BTC = 12.345678901234 sat.
	q := quote("USD", "BTC", "0.000012345678901234", 0, t)
	conv := Convert(q, n(1), usd, btc)

	if got := conv.Gross.String(); got != "12" {
		t.Errorf("gross = %s, want 12 (fraction left in the FX position)", got)
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

// A quote pinned to one amount or one party is refused on anything else:
// the pricing service bounds its exposure per quote, and the ledger is what
// makes that bound real.
func TestQuoteUsableForRequestAmountAndParty(t *testing.T) {
	q := quote("KES", "USD", "0.0077", 50, t)

	// Unpinned: any amount, any party.
	if err := q.UsableForRequest(n(100_00), "u-1", kes); err != nil {
		t.Fatalf("an unpinned quote should accept any request, got %v", err)
	}

	// Pinned amount: only that exact amount may consume it.
	q.FromAmount = n(100_00)
	if err := q.UsableForRequest(n(100_00), "u-1", kes); err != nil {
		t.Fatalf("matching amount should pass, got %v", err)
	}
	wantCode(t, q.UsableForRequest(n(200_00), "u-1", kes), "QUOTE_AMOUNT_MISMATCH")

	// Pinned party: only that owner's wallet may be the source.
	q.FromAmount = nil
	party := "u-2"
	q.PartyID = &party
	if err := q.UsableForRequest(n(100_00), "u-2", kes); err != nil {
		t.Fatalf("matching party should pass, got %v", err)
	}
	wantCode(t, q.UsableForRequest(n(100_00), "u-1", kes), "QUOTE_PARTY_MISMATCH")
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
