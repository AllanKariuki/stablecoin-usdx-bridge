package policy

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func writePolicy(t *testing.T, body string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "policy.yaml")
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

// The shipped example must load: it is what docker-compose mounts.
func TestTheExamplePolicyLoads(t *testing.T) {
	p, err := Load("../../policy.example.yaml")
	if err != nil {
		t.Fatalf("policy.example.yaml does not load: %v", err)
	}
	if len(p.Rules) == 0 {
		t.Fatal("policy.example.yaml loaded with no rules")
	}
}

// `targets:` moved to USDX_PROXY_ADDRESS / USDX_PROGRAM_ID /
// USDX_MINT_ADDRESS. A file still carrying it is refused, not ignored: an
// operator editing it would otherwise believe they had changed which contract
// the signer signs for.
func TestAPolicyStillCarryingTargetsIsRefused(t *testing.T) {
	path := writePolicy(t, `
targets:
  ETHEREUM: ["0x1111111111111111111111111111111111111111"]
rules:
  - chain: ETHEREUM
    method: pause
    allowed_callers: [compliance]
`)
	_, err := Load(path)
	if err == nil || !strings.Contains(err.Error(), "USDX_PROXY_ADDRESS") {
		t.Fatalf("err = %v, want a refusal naming the replacement variables", err)
	}
}
