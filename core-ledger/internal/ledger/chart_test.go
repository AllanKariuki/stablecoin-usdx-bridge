package ledger

import (
	"strings"
	"testing"
)

func buildDefaultChart(t *testing.T) map[string]*Account {
	t.Helper()
	accounts, err := BuildChart(DefaultCurrencies())
	if err != nil {
		t.Fatalf("BuildChart: %v", err)
	}
	byCode := map[string]*Account{}
	for _, a := range accounts {
		if _, dup := byCode[a.GLCode]; dup {
			t.Fatalf("duplicate GL code %s", a.GLCode)
		}
		byCode[a.GLCode] = a
	}
	return byCode
}

func TestChartInvariants(t *testing.T) {
	byCode := buildDefaultChart(t)

	for code, a := range byCode {
		// A leaf holds money, so it must know what currency that money is in.
		if a.Usage == UsageDetail && a.Currency == "" {
			t.Errorf("%s is a DETAIL account with no currency", code)
		}
		// The normal side is a function of the type, never an independent choice.
		if a.NormalSide != a.Type.NormalSide() {
			t.Errorf("%s is a %s with normal side %s", code, a.Type, a.NormalSide)
		}
		if !strings.HasSuffix(a.Hierarchy, code+".") {
			t.Errorf("%s has hierarchy %q, which does not end in its own code", code, a.Hierarchy)
		}
		// A child must sit under its parent's path, or subtree rollups silently
		// miss it.
		if a.ParentID != nil {
			parent := parentOf(byCode, a)
			if parent == nil {
				t.Errorf("%s has a parent id that matches no account", code)
				continue
			}
			if !strings.HasPrefix(a.Hierarchy, parent.Hierarchy) {
				t.Errorf("%s hierarchy %q is not under its parent %s (%q)", code, a.Hierarchy, parent.GLCode, parent.Hierarchy)
			}
			if parent.Usage != UsageHeader {
				t.Errorf("%s hangs off %s, which is a DETAIL account", code, parent.GLCode)
			}
		}
	}
}

func TestChartSeedsTheAccountsTheFlowsAskFor(t *testing.T) {
	byCode := buildDefaultChart(t)

	// Every GL code a flow resolves must exist, or the flow fails at runtime
	// on a path no unit test would otherwise reach.
	required := []string{
		GLCirculation,
		GLBridgeSuspense,
		GLTrustBank("USD"), GLTrustBank("KES"),
		GLReserveBacking("USD"),
		GLFxPosition("USD"), GLFxPosition("KES"),
		GLIssuanceFee("USD"), GLRedemptionFee("USD"),
		GLFxSpread("USD"), GLFxSpread("KES"),
		GLTransferFee("USD"), GLTransferFee(USDXCode),
		GLFiatSuspense("USD"),
		GLWalletParent("USD"), GLWalletParent(USDXCode),
	}
	for _, code := range required {
		if _, ok := byCode[code]; !ok {
			t.Errorf("chart is missing %s, which a flow resolves by name", code)
		}
	}
}

// USD-X is issued, not custodied: it has no bank account, no reserve backing of
// its own and no FX position, and seeding those would put accounts in the trial
// balance that nothing can ever post to.
func TestChartDoesNotGiveUSDXCustodyAccounts(t *testing.T) {
	byCode := buildDefaultChart(t)

	for _, code := range []string{
		GLTrustBank(USDXCode),
		GLReserveBacking(USDXCode),
		GLFxPosition(USDXCode),
		GLFiatSuspense(USDXCode),
	} {
		if _, ok := byCode[code]; ok {
			t.Errorf("chart seeded %s, but USD-X is issued rather than held at a custodian", code)
		}
	}
}

// Customer money and platform-maintained invariants must not be hand-postable;
// an operator correcting them goes through a reversal instead.
func TestSystemAccountsRefuseManualEntries(t *testing.T) {
	byCode := buildDefaultChart(t)

	for _, code := range []string{GLCirculation, GLBridgeSuspense, GLReserveBacking("USD"), GLTrustBank("USD")} {
		if byCode[code].ManualEntriesAllowed {
			t.Errorf("%s allows manual entries; it is maintained by the posting engine", code)
		}
	}
}

func TestWalletAccountHangsOffItsCurrencyRollup(t *testing.T) {
	byCode := buildDefaultChart(t)
	parent := byCode[GLWalletParent("KES")]

	w := &Wallet{ID: "w-1", UserID: "u-1", Currency: "KES", Label: "Savings"}
	a := newWalletAccount(w, parent)

	if a.Type != LIABILITY {
		t.Errorf("a customer wallet is a liability of the platform, got %s", a.Type)
	}
	if a.NormalSide != DirCredit {
		t.Errorf("wallet balances read positive on a credit, got normal side %s", a.NormalSide)
	}
	if !strings.HasPrefix(a.Hierarchy, parent.Hierarchy) {
		t.Errorf("wallet account hierarchy %q is not under %q", a.Hierarchy, parent.Hierarchy)
	}
	if a.ManualEntriesAllowed {
		t.Error("customer balances must not be hand-postable")
	}
	if a.OwnerUserID == nil || *a.OwnerUserID != "u-1" {
		t.Error("a wallet account should carry its owner")
	}
	if a.ID != AccountIDFor(GLWallet("KES", "w-1")) {
		t.Error("account id should be derivable from the GL code")
	}
}

// Seeding runs on every boot, so it has to produce the same ids every time or
// each deploy would create a parallel chart of accounts.
func TestAccountIDsAreDeterministic(t *testing.T) {
	first, err := BuildChart(DefaultCurrencies())
	if err != nil {
		t.Fatal(err)
	}
	second, err := BuildChart(DefaultCurrencies())
	if err != nil {
		t.Fatal(err)
	}
	for i := range first {
		if first[i].ID != second[i].ID {
			t.Fatalf("%s got different ids across builds: %s vs %s", first[i].GLCode, first[i].ID, second[i].ID)
		}
	}
}

func parentOf(byCode map[string]*Account, a *Account) *Account {
	for _, candidate := range byCode {
		if candidate.ID == *a.ParentID {
			return candidate
		}
	}
	return nil
}
