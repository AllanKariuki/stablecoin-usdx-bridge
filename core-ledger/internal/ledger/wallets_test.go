package ledger

import (
	"errors"
	"testing"
)

func TestValidateAddress(t *testing.T) {
	cases := []struct {
		name, chain, address, code string
	}{
		{"ethereum checksummed", "ETHEREUM", "0x4e29A6a3689F37db9a93985A0f6424420cc2CD49", ""},
		{"solana pubkey", "SOLANA", "257pTZ4CBDLmQrdwpSHC6ahrJkxSaQFFEohpeXD3H3FJ", ""},
		// HexToAddress maps this to the zero address rather than failing,
		// which is how it used to reach bridgeMint and revert there.
		{"ethereum placeholder", "ETHEREUM", "0xUSER", "INVALID_ADDRESS"},
		{"ethereum zero address", "ETHEREUM", "0x0000000000000000000000000000000000000000", "INVALID_ADDRESS"},
		{"ethereum empty", "ETHEREUM", "", "INVALID_ADDRESS"},
		{"solana not base58", "SOLANA", "0x4e29A6a3689F37db9a93985A0f6424420cc2CD49", "INVALID_ADDRESS"},
		{"lowercase chain", "ethereum", "0x4e29A6a3689F37db9a93985A0f6424420cc2CD49", "UNKNOWN_CHAIN"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := validateAddress(tc.chain, tc.address)
			if tc.code == "" {
				if err != nil {
					t.Fatalf("want ok, got %v", err)
				}
				return
			}
			var pe *PostingError
			if !errors.As(err, &pe) || pe.Code != tc.code {
				t.Fatalf("want %s, got %v", tc.code, err)
			}
		})
	}
}
