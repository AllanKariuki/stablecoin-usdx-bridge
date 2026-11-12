package config

import (
	"strings"
	"testing"
)

const (
	proxy   = "0x1111111111111111111111111111111111111111"
	program = "9GFGtYxGtZg8Smk4yyya7zAT6V3WcLDsB9XWWQbxMS8"
	mint    = "So11111111111111111111111111111111111111112"
)

// Outside local, a deployment missing a contract would not fail at boot — it
// would fail at its first mint, inside a saga. So it fails at boot.
func TestDeploymentIsRequiredOutsideLocal(t *testing.T) {
	cases := []struct {
		name                string
		env                 string
		proxy, program, mnt string
		wantErr             string
	}{
		{"production, complete", "production", proxy, program, mint, ""},
		{"production, no proxy", "production", "", program, mint, "USDX_PROXY_ADDRESS"},
		{"production, no program", "staging", proxy, "", mint, "USDX_PROGRAM_ID"},
		{"production, no mint", "production", proxy, program, "", "USDX_MINT_ADDRESS"},
		{"production, nothing", "production", "", "", "", "required when ENV is not local"},
		{"production, placeholder proxy", "production", "0x0000000000000000000000000000000000000000", program, mint, "zero address"},
		// Local may leave a chain unset (it then signs nothing for it)...
		{"local, nothing", "local", "", "", "", ""},
		{"local, ethereum only", "local", proxy, "", "", ""},
		// ...but what it does set must still parse.
		{"local, bad mint", "local", proxy, program, "not-a-key-0OIl", "USDX_MINT_ADDRESS"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			cfg := Config{Env: tc.env, USDXProxyAddress: tc.proxy, USDXProgramID: tc.program, USDXMintAddress: tc.mnt}
			_, err := cfg.Deployment()
			if tc.wantErr == "" {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				return
			}
			if err == nil || !strings.Contains(err.Error(), tc.wantErr) {
				t.Fatalf("err = %v, want one mentioning %q", err, tc.wantErr)
			}
		})
	}
}
