package ledger

import (
	"encoding/json"
	"fmt"
	"math/big"
	"strings"
)

// USDXDecimals is USD-X's smallest-unit exponent, matching both chains'
// decimals() (USDX.sol's override on Ethereum, USDX_DECIMALS in Solana's
// constants.rs).
const USDXDecimals = 6

// DecimalAmount accepts a JSON decimal string (e.g. "1000000.00", matching
// the DAMP spec's example payloads) and converts it to an integer count of
// USD-X's smallest unit — the form the rest of the system works in
// (BridgeTransfer.Amount, the NUMERIC(38,0) column, and the on-chain
// mint/burn instructions all deal in smallest units, never decimals).
type DecimalAmount struct {
	SmallestUnit *big.Int
}

func (a *DecimalAmount) UnmarshalJSON(data []byte) error {
	var s string
	if err := json.Unmarshal(data, &s); err != nil {
		return fmt.Errorf("amount must be a decimal string, e.g. \"1000000.00\": %w", err)
	}
	v, err := ParseDecimalAmount(s)
	if err != nil {
		return err
	}
	a.SmallestUnit = v
	return nil
}

// ParseDecimalAmount converts a decimal dollar string into USD-X's
// smallest-unit integer, rejecting more fractional digits than USDXDecimals
// supports (silently truncating would misrepresent the amount the client
// asked for).
func ParseDecimalAmount(s string) (*big.Int, error) {
	s = strings.TrimSpace(s)
	neg := strings.HasPrefix(s, "-")
	if neg {
		s = s[1:]
	}

	whole, frac, _ := strings.Cut(s, ".")
	if whole == "" && frac == "" {
		return nil, fmt.Errorf("amount is empty")
	}
	if len(frac) > USDXDecimals {
		return nil, fmt.Errorf("amount has more than %d decimal places", USDXDecimals)
	}
	frac += strings.Repeat("0", USDXDecimals-len(frac))

	v, ok := new(big.Int).SetString(whole+frac, 10)
	if !ok {
		return nil, fmt.Errorf("invalid amount %q", s)
	}
	if neg {
		v.Neg(v)
	}
	return v, nil
}
