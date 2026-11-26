package bridge

import (
	"context"
	"math/big"
)

// ChainClient is what both the Ethereum and Solana clients implement, so the
// saga never needs a switch on chain-specific types.
type ChainClient interface {
	BridgeMint(to string, amount *big.Int, correlationID string) (txHash string, err error)
	BridgeBurn(from string, amount *big.Int, correlationID string) (txHash string, err error)
	WaitForFinality(txHash string, param string) error

	// VerifyBurn is H4's break-glass proof: it looks the transaction up on
	// chain and checks it really is the burn the caller claims — the right
	// contract or program, the right source, the right amount, the right
	// correlation id, finalised. It submits nothing and moves nothing; its
	// typed errors (ErrBurnNotFound, ErrBurnMismatch, ErrBurnNotFinal,
	// ErrBurnReverted) are what the maker-checker callback records when it
	// refuses to settle.
	VerifyBurn(ctx context.Context, txHash, from string, amount *big.Int, correlationID string) error

	// ValidTxHash reports whether txHash has the right shape for this chain,
	// before anything bothers to ask the chain about it.
	ValidTxHash(txHash string) bool
}

// EnforcementClient is the subset of a chain client that H6's compliance
// enforcement actions need. Both real clients implement it; the handler
// refuses with UNSUPPORTED_ON_CHAIN when the router's client does not (a test
// fake, or a chain whose program has no such surface).
type EnforcementClient interface {
	// Blacklist / Unblacklist toggle an address on the token's blacklist
	// (Ethereum's COMPLIANCE_ROLE). reference is the compliance action id,
	// carried to the signer as the correlation id so a retry re-signs the
	// same authorisation instead of a new one.
	Blacklist(address, reference string) (txHash string, err error)
	Unblacklist(address, reference string) (txHash string, err error)

	// Pause / Unpause halt or resume the bridge. On Solana they map to the
	// program's set_paused instruction rather than an ERC20 pause.
	Pause(reference string) (txHash string, err error)
	Unpause(reference string) (txHash string, err error)

	// IsPauseAuthority reports whether this client's signer holds the
	// authority the chain's pause instruction demands. Ethereum answers by
	// reading PAUSER_ROLE from the contract; Solana by comparing the signer
	// to the BridgeConfig admin. A refusal here is cheaper than a
	// transaction that reverts on chain.
	IsPauseAuthority(ctx context.Context) (bool, error)

	// FinalityStatus asks whether txHash has reached finality, WITHOUT
	// waiting — Sepolia finality can trail the head by two epochs, which no
	// HTTP request should sit through. final=true means the chain recorded
	// the transaction at the configured depth; final=false means it is not
	// there yet (or not seen). err is non-nil when the chain could not be
	// asked at all (transient — ask again later) or when the transaction
	// landed and failed, which wraps ErrTxFailedOnChain (terminal).
	FinalityStatus(txHash string) (final bool, err error)
}

type Router struct {
	clients map[string]ChainClient // "ETHEREUM" | "SOLANA" -> client
}

func NewRouter(eth ChainClient, sol ChainClient) *Router {
	return &Router{clients: map[string]ChainClient{
		"ETHEREUM": eth,
		"SOLANA":   sol,
	}}
}

func (r *Router) For(chain string) (ChainClient, bool) {
	c, ok := r.clients[chain]
	return c, ok
}

// Enforcer returns chain's enforcement surface, when its client has one.
func (r *Router) Enforcer(chain string) (EnforcementClient, bool) {
	c, ok := r.clients[chain]
	if !ok {
		return nil, false
	}
	e, ok := c.(EnforcementClient)
	return e, ok
}
