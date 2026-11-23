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
