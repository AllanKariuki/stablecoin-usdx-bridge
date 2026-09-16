package solana

import "math/big"

// Client wraps solana-go instruction builders generated against the Anchor
// IDL for usdx_bridge. Same shape as the Ethereum client so internal/bridge
// can treat both uniformly via the ChainClient interface.
type Client struct {
	rpcURL    string
	programID string
}

func NewClient(rpcURL, programID string) *Client {
	return &Client{rpcURL: rpcURL, programID: programID}
}

func (c *Client) BridgeMint(to string, amount *big.Int, correlationID string) (txSig string, err error) {
	// TODO: build the bridge_mint instruction (mint, mint_authority PDA,
	// destination ATA, processed_marker PDA, relayer signer), send + confirm.
	panic("not implemented")
}

func (c *Client) BridgeBurn(from string, amount *big.Int, correlationID string) (txSig string, err error) {
	// TODO: same shape as BridgeMint, calling bridge_burn.
	panic("not implemented")
}

func (c *Client) WaitForFinality(txSig string, commitment string) error {
	// TODO: poll getSignatureStatuses until commitment == "finalized".
	panic("not implemented")
}

func (c *Client) TotalSupply() (*big.Int, uint64 /* slot */, error) {
	// TODO: call getTokenSupply on the mint account.
	panic("not implemented")
}
