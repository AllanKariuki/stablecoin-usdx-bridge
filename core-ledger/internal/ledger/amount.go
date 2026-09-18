package ledger

import (
	"encoding/json"
	"fmt"
	"math/big"
	"strings"
)

// USDXDecimals is USD-X's smallest-unit exponent, matching both chains'
// decimals() (USDX.sol's override on Ethereum, USDX_DECIMALS in Solana's
// constants.rs). It is the seed value for the USDX row in the currencies
// table; everything at runtime reads Currency.Decimals instead, so a
// two-decimal fiat currency can share the same code paths.
const USDXDecimals = 6

// MaxDecimals caps what the NUMERIC(38,0) amount columns can round-trip
// without silent loss, and bounds the 10^n exponentiation below.
const MaxDecimals = 30

// DecimalAmount is a decimal string as it arrives on the wire (e.g.
// "1000000.00", matching the DAMP spec's example payloads), held unparsed
// until a currency says how many places it has.
//
// The old version of this type parsed at 6 decimals in UnmarshalJSON, which
// silently made every amount a USD-X amount. With fiat in the system that is
// wrong twice over: "10.00" USD is 1000 cents, not 10000000, and "10.001" USD
// should be rejected rather than accepted as a third cent place.
type DecimalAmount struct {
	Raw string
}

func (a *DecimalAmount) UnmarshalJSON(data []byte) error {
	var s string
	if err := json.Unmarshal(data, &s); err != nil {
		return fmt.Errorf("amount must be a decimal string, e.g. \"1000000.00\": %w", err)
	}
	a.Raw = s
	return nil
}

func (a DecimalAmount) MarshalJSON() ([]byte, error) { return json.Marshal(a.Raw) }

// In converts the wire value to an integer count of the currency's smallest
// unit. Callers must have resolved the Currency first — that is the point.
func (a DecimalAmount) In(c *Currency) (*big.Int, error) {
	if c == nil {
		return nil, fmt.Errorf("amount: no currency to parse against")
	}
	return ParseDecimal(a.Raw, c.Decimals)
}

// ParseDecimal converts a decimal string into an integer count of the smallest
// unit at the given scale, rejecting more fractional digits than the scale
// supports (silently truncating would misrepresent the amount the client
// asked for).
func ParseDecimal(s string, decimals int32) (*big.Int, error) {
	if decimals < 0 || decimals > MaxDecimals {
		return nil, fmt.Errorf("unsupported scale %d", decimals)
	}

	s = strings.TrimSpace(s)
	neg := strings.HasPrefix(s, "-")
	if neg {
		s = s[1:]
	}
	s = strings.TrimPrefix(s, "+")

	whole, frac, hadPoint := strings.Cut(s, ".")
	if whole == "" && frac == "" {
		return nil, fmt.Errorf("amount is empty")
	}
	if hadPoint && frac == "" {
		return nil, fmt.Errorf("invalid amount %q: trailing decimal point", s)
	}
	if !isDigits(whole) || !isDigits(frac) {
		return nil, fmt.Errorf("invalid amount %q: must be a plain decimal number", s)
	}
	if int32(len(frac)) > decimals {
		return nil, fmt.Errorf("amount %q has more than %d decimal places", s, decimals)
	}
	frac += strings.Repeat("0", int(decimals)-len(frac))

	v, ok := new(big.Int).SetString(whole+frac, 10)
	if !ok {
		return nil, fmt.Errorf("invalid amount %q", s)
	}
	if neg {
		v.Neg(v)
	}
	return v, nil
}

// ParseDecimalAmount is the USD-X-scaled shorthand the pre-ledger code used.
// Retained so on-chain call sites that are unambiguously in USD-X keep
// reading plainly.
func ParseDecimalAmount(s string) (*big.Int, error) { return ParseDecimal(s, USDXDecimals) }

// FormatDecimal renders a smallest-unit integer back to a decimal string with
// exactly `decimals` places — the inverse of ParseDecimal, so an amount that
// round-trips through the API comes back in the form it went in.
func FormatDecimal(v *big.Int, decimals int32) string {
	if v == nil {
		return ""
	}
	neg := v.Sign() < 0
	abs := new(big.Int).Abs(v)

	digits := abs.String()
	if int32(len(digits)) <= decimals {
		digits = strings.Repeat("0", int(decimals)-len(digits)+1) + digits
	}
	split := int32(len(digits)) - decimals

	out := digits[:split]
	if decimals > 0 {
		out += "." + digits[split:]
	}
	if neg {
		out = "-" + out
	}
	return out
}

// pow10 returns 10^n as a big.Int. n is bounded by MaxDecimals at every call
// site, so this cannot be used to allocate an unbounded number.
func pow10(n int32) *big.Int {
	return new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(n)), nil)
}

func isDigits(s string) bool {
	for i := 0; i < len(s); i++ {
		if s[i] < '0' || s[i] > '9' {
			return false
		}
	}
	return true
}
