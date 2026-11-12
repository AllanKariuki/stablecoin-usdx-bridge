package decode

import (
	"errors"
	"fmt"

	"github.com/ethereum/go-ethereum/common"
	solanago "github.com/gagliardetto/solana-go"
)

// Deployment is which on-chain accounts are this platform's: the USD-X proxy
// on Ethereum, and the usdx_bridge program and the USD-X mint on Solana.
//
// The decoder can prove what a transaction says; only this says whether the
// contract it calls is ours. It is per-deployment configuration rather than
// policy because it is the same three values core-ledger is configured with
// (USDX_PROXY_ADDRESS, USDX_PROGRAM_ID, USDX_MINT_ADDRESS) — one source per
// environment, not a second copy in a policy file to drift during a redeploy.
//
// A zero field means that chain is not configured, and the decoder refuses
// every request for it: a signer that does not know which contract is ours
// cannot tell a mint from a call to an attacker's look-alike.
type Deployment struct {
	EthContract common.Address
	SolProgram  solanago.PublicKey
	SolMint     solanago.PublicKey
}

// ParseDeployment validates whatever is set. Empty is allowed here (it means
// "this chain signs nothing"); whether empty is acceptable at all is
// RequireComplete's decision, made by the caller that knows the environment.
func ParseDeployment(ethContract, solProgram, solMint string) (Deployment, error) {
	var d Deployment
	if ethContract != "" {
		// IsHexAddress first: HexToAddress maps garbage to the zero address
		// without complaint, which would read as "unconfigured" rather than
		// "wrong".
		if !common.IsHexAddress(ethContract) {
			return d, fmt.Errorf("USDX_PROXY_ADDRESS %q is not an Ethereum address", ethContract)
		}
		d.EthContract = common.HexToAddress(ethContract)
		if d.EthContract == (common.Address{}) {
			// The placeholder the example policy used to ship with. A mint
			// "to the zero contract" is never what anyone meant.
			return d, errors.New("USDX_PROXY_ADDRESS is the zero address; set the deployed USD-X proxy")
		}
	}
	parse := func(name, value string) (solanago.PublicKey, error) {
		if value == "" {
			return solanago.PublicKey{}, nil
		}
		pk, err := solanago.PublicKeyFromBase58(value)
		if err != nil {
			return pk, fmt.Errorf("%s %q is not a Solana pubkey: %w", name, value, err)
		}
		if pk.IsZero() {
			return pk, fmt.Errorf("%s is the all-zero pubkey (the System Program)", name)
		}
		return pk, nil
	}
	var err error
	if d.SolProgram, err = parse("USDX_PROGRAM_ID", solProgram); err != nil {
		return d, err
	}
	if d.SolMint, err = parse("USDX_MINT_ADDRESS", solMint); err != nil {
		return d, err
	}
	if !d.SolProgram.IsZero() && d.SolProgram == d.SolMint {
		return d, errors.New("USDX_PROGRAM_ID and USDX_MINT_ADDRESS are the same account")
	}
	return d, nil
}

// RequireComplete is the boot check outside local development. A deployment
// missing one of these would not fail at boot — it would fail at the first
// mint on that chain, hours later and inside a saga, as a policy denial
// somebody then has to trace back to configuration.
func (d Deployment) RequireComplete() error {
	var missing []string
	if d.EthContract == (common.Address{}) {
		missing = append(missing, "USDX_PROXY_ADDRESS")
	}
	if d.SolProgram.IsZero() {
		missing = append(missing, "USDX_PROGRAM_ID")
	}
	if d.SolMint.IsZero() {
		missing = append(missing, "USDX_MINT_ADDRESS")
	}
	if len(missing) > 0 {
		return fmt.Errorf("deployment configuration missing: %v", missing)
	}
	return nil
}
