package bridge

import "math/big"

// ChainClient is what both the Ethereum and Solana clients implement, so the
// saga never needs a switch on chain-specific types.
type ChainClient interface {
	BridgeMint(to string, amount *big.Int, correlationID string) (txHash string, err error)
	BridgeBurn(from string, amount *big.Int, correlationID string) (txHash string, err error)
	WaitForFinality(txHash string, param string) error
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
