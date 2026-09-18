package ledger

import (
	"math/big"
	"time"
)

// BpsDenominator is the divisor for a basis-point rate: 10000 bps = 100%.
const BpsDenominator = 10000

// ParseRate reads a rate as a decimal string ("130.25") into FxQuote.Rate's
// fixed-point form.
func ParseRate(s string) (*big.Int, error) { return ParseDecimal(s, FxRateScale) }

// FormatRate is ParseRate's inverse, for API responses.
func FormatRate(r *big.Int) string { return FormatDecimal(r, FxRateScale) }

// Conversion is the arithmetic result of applying a quote, split into the
// three numbers the journal needs: what leaves the FX position on the quote
// side (Gross), what the house keeps (Fee), and what the user receives (Net).
// Gross == Fee + Net exactly, which is what lets the quote-side leg balance.
type Conversion struct {
	FromAmount *big.Int // debited from the user, in From's smallest units
	Gross      *big.Int // in To's smallest units, before spread
	Fee        *big.Int // in To's smallest units
	Net        *big.Int // in To's smallest units, credited to the user
}

// Convert applies a quote to an amount. Everything is integer arithmetic on
// smallest units:
//
//	gross = amount * rate * 10^toDecimals / (10^FxRateScale * 10^fromDecimals)
//
// evaluated as one fraction so the intermediate never rounds — multiplying
// first and dividing once is the difference between a rate applied exactly and
// a rate applied to an already-truncated number.
//
// The single division truncates toward zero, so a fraction of a minor unit is
// left behind in the FX position account rather than being invented for either
// side. That residue is real and shows up as a small FX position drift, which
// is correct: it is the rounding the house absorbed, and it is visible instead
// of hidden.
func Convert(q *FxQuote, amount *big.Int, from, to Currency) Conversion {
	numerator := new(big.Int).Mul(amount, q.Rate)
	numerator.Mul(numerator, pow10(to.Decimals))

	denominator := new(big.Int).Mul(pow10(FxRateScale), pow10(from.Decimals))

	gross := new(big.Int).Quo(numerator, denominator)
	fee := ApplyBps(gross, q.SpreadBps)
	net := new(big.Int).Sub(gross, fee)

	return Conversion{
		FromAmount: new(big.Int).Set(amount),
		Gross:      gross,
		Fee:        fee,
		Net:        net,
	}
}

// ApplyBps takes a basis-point cut of an amount, truncating toward zero so a
// fee can never round up past what was charged for.
func ApplyBps(amount *big.Int, bps int32) *big.Int {
	if bps <= 0 {
		return big.NewInt(0)
	}
	v := new(big.Int).Mul(amount, big.NewInt(int64(bps)))
	return v.Quo(v, big.NewInt(BpsDenominator))
}

// UsableQuote reports why a quote can't be applied to this pair right now, or
// nil if it can. Direction matters: a quote is for converting BaseCcy into
// QuoteCcy, and a KES->USD conversion needs a KES/USD quote rather than the
// reciprocal of a USD/KES one — inverting a rate with a spread on it would
// quietly charge the spread backwards.
func UsableQuote(q *FxQuote, from, to string, at time.Time) error {
	if q == nil {
		return postErr("MISSING_QUOTE", "a conversion needs an FX quote")
	}
	if q.BaseCcy != from || q.QuoteCcy != to {
		return postErr("QUOTE_PAIR_MISMATCH",
			"quote %s is %s/%s, cannot convert %s to %s", q.ID, q.BaseCcy, q.QuoteCcy, from, to)
	}
	if q.Rate == nil || q.Rate.Sign() <= 0 {
		return postErr("INVALID_RATE", "quote %s has a non-positive rate", q.ID)
	}
	if q.Expired(at) {
		return postErr("QUOTE_EXPIRED", "quote %s expired at %s", q.ID, q.ExpiresAt.Format(time.RFC3339))
	}
	return nil
}

// PegQuote is the implicit USD <-> USD-X rate. USD-X is issued 1:1 against USD
// by definition, so issuance and redemption don't consult a rate provider —
// but they still go through Convert, because the two currencies have different
// decimal scales (2 vs 6) and that rescaling is exactly what Convert does.
func PegQuote(from, to string) *FxQuote {
	return &FxQuote{
		ID:        "peg:" + from + "/" + to,
		BaseCcy:   from,
		QuoteCcy:  to,
		Rate:      pow10(FxRateScale), // 1.0
		SpreadBps: 0,
		Source:    "PEG",
	}
}
