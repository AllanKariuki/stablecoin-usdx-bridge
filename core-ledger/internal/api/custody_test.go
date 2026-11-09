package api

import (
	"io"
	"log/slog"
	"testing"
)

// fakeCustody stands in for the Solana client: a chain the platform custodies,
// and one it doesn't.
type fakeCustody struct{ solana string }

func (f fakeCustody) CustodyAddress(chain string) (string, bool) {
	if chain == "SOLANA" {
		return f.solana, true
	}
	return "", false
}

// Wallet creation is the only place the custody decision is enforced, and it
// has to be an override rather than a rejection: the caller — services/identity
// provisioning a party's wallets — cannot know the custody address, because it
// is derived from a relayer key only core-ledger holds.
func TestAddressForOnACustodiedChain(t *testing.T) {
	const custody = "PLATFORMCUSTODYADDRESS1111111111111111111111"
	h := &Handlers{
		logger:  slog.New(slog.NewTextHandler(io.Discard, nil)),
		custody: fakeCustody{solana: custody},
	}

	cases := []struct {
		name      string
		chain     string
		requested string
		want      string
	}{
		{
			name:  "solana with no address gets the custody account",
			chain: "SOLANA", requested: "", want: custody,
		},
		{
			// The case that matters. A wallet stamped with a user's own Solana
			// address looks fine until the first redemption, which fails the
			// program's NoDelegateApproval constraint — because only that
			// address's owner could ever have granted the delegation.
			name:  "solana with a user address is overridden",
			chain: "SOLANA", requested: "USERSOWNSOLANAADDRESS2222222222222222222222", want: custody,
		},
		{
			// Ethereum's bridgeBurn works against any holder under
			// BRIDGE_ROLE, so self-custody there costs nothing and is kept.
			name:  "ethereum keeps the user's own address",
			chain: "ETHEREUM", requested: "0xUSER", want: "0xUSER",
		},
		{
			name:  "fiat wallets are unaffected",
			chain: "", requested: "", want: "",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := h.addressFor(tc.chain, tc.requested); got != tc.want {
				t.Fatalf("addressFor(%q, %q) = %q, want %q", tc.chain, tc.requested, got, tc.want)
			}
		})
	}
}

// A deployment with no custodied chain — or a test harness — passes nil, and
// must get the caller's address back untouched rather than an empty string.
func TestAddressForWithoutACustodyResolver(t *testing.T) {
	h := &Handlers{logger: slog.New(slog.NewTextHandler(io.Discard, nil))}
	if got := h.addressFor("SOLANA", "SOMEADDRESS"); got != "SOMEADDRESS" {
		t.Fatalf("addressFor = %q, want the requested address", got)
	}
}
