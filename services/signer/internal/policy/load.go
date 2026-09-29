package policy

import (
	"fmt"
	"math/big"
	"os"
	"strings"

	"gopkg.in/yaml.v3"
)

// The on-disk policy, mounted as a file rather than set through env vars or
// an API.
//
// A file because a policy is a document somebody reviews: it belongs in
// version control with a diff and an approver, mounted read-only. An endpoint
// that could edit it would make "what are the limits" a question with a
// runtime answer, and would give anyone who compromised this service a way to
// raise its own ceilings before using them.

type fileRule struct {
	Chain        string   `yaml:"chain"`
	Method       string   `yaml:"method"`
	MaxAmount    string   `yaml:"max_amount"`
	Destinations []string `yaml:"allowed_destinations"`
	Callers      []string `yaml:"allowed_callers"`
}

type file struct {
	Rules       []fileRule        `yaml:"rules"`
	DailyLimits map[string]string `yaml:"daily_limits"`
}

// Load reads a policy file. A missing or unparseable file is an error, never
// an empty policy: an empty Policy denies everything, which would look like a
// total outage, and the fix somebody would reach for under that pressure is
// to disable the check.
func Load(path string) (Policy, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return Policy{}, fmt.Errorf("reading the signing policy at %s: %w", path, err)
	}

	var parsed file
	if err := yaml.Unmarshal(raw, &parsed); err != nil {
		return Policy{}, fmt.Errorf("parsing the signing policy: %w", err)
	}
	if len(parsed.Rules) == 0 {
		return Policy{}, fmt.Errorf("the signing policy at %s has no rules; a signer with no rules signs nothing", path)
	}

	p := Policy{DailyLimits: map[string]*big.Int{}}
	for i, r := range parsed.Rules {
		if r.Method == "" {
			return Policy{}, fmt.Errorf("policy rule %d has no method", i+1)
		}
		rule := Rule{
			Chain:               strings.ToUpper(r.Chain),
			Method:              Method(r.Method),
			AllowedDestinations: r.Destinations,
			AllowedCallers:      r.Callers,
		}
		if r.MaxAmount != "" {
			amount, ok := new(big.Int).SetString(r.MaxAmount, 10)
			if !ok {
				return Policy{}, fmt.Errorf("policy rule %d: max_amount %q is not an integer in smallest units",
					i+1, r.MaxAmount)
			}
			rule.MaxAmount = amount
		}
		p.Rules = append(p.Rules, rule)
	}

	for key, value := range parsed.DailyLimits {
		amount, ok := new(big.Int).SetString(value, 10)
		if !ok {
			return Policy{}, fmt.Errorf("daily limit %q is not an integer in smallest units: %q", key, value)
		}
		p.DailyLimits[strings.ToUpper(key)] = amount
	}
	return p, nil
}
