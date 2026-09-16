package ethereum

import "math/big"

// Client wraps go-ethereum bindings generated (via abigen) from
// shared/abi/USDX.json. Kept as a thin interface implementation so
// internal/bridge never imports go-ethereum types directly.
type Client struct {
	rpcURL          string
	contractAddress string
}

func NewClient(rpcURL, contractAddress string) *Client {
	return &Client{rpcURL: rpcURL, contractAddress: contractAddress}
}

func (c *Client) BridgeMint(to string, amount *big.Int, correlationID string) (txHash string, err error) {
	// TODO: build + sign + send a bridgeMint(to, amount, correlationId) tx
	// using the relayer's key, wait for receipt, return tx hash.
	panic("not implemented")
}

func (c *Client) BridgeBurn(from string, amount *big.Int, correlationID string) (txHash string, err error) {
	// TODO: same shape as BridgeMint, calling bridgeBurn.
	panic("not implemented")
}

func (c *Client) WaitForFinality(txHash string, confirmations uint64) error {
	// TODO: poll for `confirmations` blocks on top of the tx's block.
	panic("not implemented")
}

func (c *Client) TotalSupply() (*big.Int, uint64 /* block number */, error) {
	// TODO: call totalSupply() at latest block, return with block number
	// for the eth_supply_snapshot row.
	panic("not implemented")
}
