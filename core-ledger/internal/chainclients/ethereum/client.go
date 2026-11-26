package ethereum

import (
	"context"
	"fmt"
	"math/big"
	"strconv"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/ethclient"
	"github.com/ethereum/go-ethereum/rpc"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/bridge"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/chainclients/ethereum/gen"
)

// pollInterval/waitTimeout bound every polling loop below (receipt lookup,
// confirmation counting, finalized-block catch-up).
const (
	pollInterval = 2 * time.Second
	waitTimeout  = 5 * time.Minute
)

// Client wraps the go-ethereum bindings generated (via abigen, see
// gen/usdx.go) from shared/abi/USDX.json. Kept as a thin interface
// implementation so internal/bridge never imports go-ethereum types
// directly.
type Client struct {
	ec       *ethclient.Client
	contract *gen.USDX
	chainID  *big.Int
	signer   Signer

	// proxy is the USDX proxy address this client is bound to — the contract
	// VerifyBurn requires the receipt to be for, never the bare implementation
	// address (see chains/ethereum/script/USDX.s.sol).
	proxy common.Address

	// finalityLevel is the same vocabulary WaitForFinality accepts
	// ("finalized" or a confirmation count); VerifyBurn uses it as the depth
	// a burn must have reached before it counts as proof.
	finalityLevel string
}

// NewClient dials rpcURL and binds to the USDX proxy at contractAddress
// (USDX_PROXY_ADDRESS — never the bare implementation address, see
// chains/ethereum/script/USDX.s.sol). relayerKeyHex is the hex-encoded
// private key for the address holding BRIDGE_ROLE, the only account
// allowed to call bridgeMint/bridgeBurn.
func NewClient(rpcURL, contractAddress, relayerKeyHex string) (*Client, error) {
	signer, err := NewLocalSigner(relayerKeyHex)
	if err != nil {
		return nil, err
	}
	return NewClientWithSigner(rpcURL, contractAddress, signer)
}

// NewClientWithSigner is the constructor P6 will call, handing in a signer
// backed by the signer service instead of a key this process holds.
func NewClientWithSigner(rpcURL, contractAddress string, signer Signer) (*Client, error) {
	ec, err := ethclient.Dial(rpcURL)
	if err != nil {
		return nil, fmt.Errorf("dialing ethereum rpc: %w", err)
	}

	proxy := common.HexToAddress(contractAddress)
	contract, err := gen.NewUSDX(proxy, ec)
	if err != nil {
		return nil, fmt.Errorf("binding USDX contract: %w", err)
	}

	chainID, err := ec.ChainID(context.Background())
	if err != nil {
		return nil, fmt.Errorf("fetching chain id: %w", err)
	}

	return &Client{
		ec:       ec,
		contract: contract,
		chainID:  chainID,
		signer:   signer,
		proxy:    proxy,
		// The same default the saga ships with; dial.go overrides it from
		// CHAIN_FINALITY.
		finalityLevel: "finalized",
	}, nil
}

// WithFinalityLevel sets the depth a burn must have reached before VerifyBurn
// accepts it — the same "finalized"/confirmation-count vocabulary
// WaitForFinality uses.
func (c *Client) WithFinalityLevel(level string) *Client {
	if level != "" {
		c.finalityLevel = level
	}
	return c
}

// transactor builds the options the generated bindings sign through.
//
// The method name, amount and destination are carried to the signer so a
// remote one can enforce policy on what is actually being authorised. A local
// signer ignores them, which is why this is one code path rather than two.
func (c *Client) transactor(ctx context.Context, method, correlationID string, amount *big.Int, to string) (*bind.TransactOpts, error) {
	opts := transactorFor(bindContext(c.signer, method, correlationID, amount, to), c.chainID)
	opts.Context = ctx
	return opts, nil
}

func (c *Client) BridgeMint(to string, amount *big.Int, correlationID string) (string, error) {
	opts, err := c.transactor(context.Background(), "bridgeMint", correlationID, amount, to)
	if err != nil {
		return "", err
	}
	tx, err := c.contract.BridgeMint(opts, common.HexToAddress(to), amount, bridge.CorrelationIDHash(correlationID))
	if err != nil {
		return "", fmt.Errorf("bridgeMint tx: %w", err)
	}
	return tx.Hash().Hex(), nil
}

func (c *Client) BridgeBurn(from string, amount *big.Int, correlationID string) (string, error) {
	opts, err := c.transactor(context.Background(), "bridgeBurn", correlationID, amount, from)
	if err != nil {
		return "", err
	}
	tx, err := c.contract.BridgeBurn(opts, common.HexToAddress(from), amount, bridge.CorrelationIDHash(correlationID))
	if err != nil {
		return "", fmt.Errorf("bridgeBurn tx: %w", err)
	}
	return tx.Hash().Hex(), nil
}

// WaitForFinality matches bridge.ChainClient's signature (the same string
// vocabulary the saga uses for both chains). finalityLevel is either
// "finalized" (wait for post-merge Ethereum's finalized checkpoint to pass
// the tx's block) or a plain confirmation-count integer, e.g. "12".
func (c *Client) WaitForFinality(txHash string, finalityLevel string) error {
	ctx, cancel := context.WithTimeout(context.Background(), waitTimeout)
	defer cancel()

	hash := common.HexToHash(txHash)
	receipt, err := c.waitForReceipt(ctx, hash)
	if err != nil {
		return err
	}
	if receipt.Status == 0 {
		// Mined and reverted: the hash itself is permanently failed, so the
		// saga must treat it as terminal rather than wait on it again.
		return fmt.Errorf("tx %s reverted: %w", txHash, bridge.ErrTxFailedOnChain)
	}

	if finalityLevel == "finalized" {
		return c.waitForFinalizedBlock(ctx, receipt.BlockNumber)
	}

	confirmations, err := strconv.ParseUint(finalityLevel, 10, 64)
	if err != nil {
		return fmt.Errorf("finalityLevel must be \"finalized\" or a confirmation count, got %q", finalityLevel)
	}
	return c.waitForConfirmations(ctx, receipt.BlockNumber, confirmations)
}

func (c *Client) waitForReceipt(ctx context.Context, hash common.Hash) (*types.Receipt, error) {
	ticker := time.NewTicker(pollInterval)
	defer ticker.Stop()
	for {
		receipt, err := c.ec.TransactionReceipt(ctx, hash)
		if err == nil {
			return receipt, nil
		}
		if err != ethereum.NotFound {
			return nil, fmt.Errorf("fetching receipt for %s: %w", hash, err)
		}
		select {
		case <-ctx.Done():
			return nil, fmt.Errorf("timed out waiting for tx %s to be mined: %w", hash, ctx.Err())
		case <-ticker.C:
		}
	}
}

func (c *Client) waitForFinalizedBlock(ctx context.Context, blockNumber *big.Int) error {
	ticker := time.NewTicker(pollInterval)
	defer ticker.Stop()
	for {
		header, err := c.ec.HeaderByNumber(ctx, big.NewInt(rpc.FinalizedBlockNumber.Int64()))
		if err != nil {
			// The deadline can land mid-call rather than in the select below;
			// the receipt is already in hand, so that is still "not final yet".
			if ctx.Err() != nil {
				return fmt.Errorf("timed out waiting for block %s to finalize: %w: %w", blockNumber, bridge.ErrNotFinal, ctx.Err())
			}
			return fmt.Errorf("fetching finalized header: %w", err)
		}
		if header.Number.Cmp(blockNumber) >= 0 {
			return nil
		}
		select {
		case <-ctx.Done():
			return fmt.Errorf("timed out waiting for block %s to finalize: %w: %w", blockNumber, bridge.ErrNotFinal, ctx.Err())
		case <-ticker.C:
		}
	}
}

func (c *Client) waitForConfirmations(ctx context.Context, blockNumber *big.Int, confirmations uint64) error {
	ticker := time.NewTicker(pollInterval)
	defer ticker.Stop()
	for {
		latest, err := c.ec.BlockNumber(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return fmt.Errorf("timed out waiting for %d confirmations on block %s: %w: %w", confirmations, blockNumber, bridge.ErrNotFinal, ctx.Err())
			}
			return fmt.Errorf("fetching latest block number: %w", err)
		}
		have := latest - blockNumber.Uint64() + 1
		if have >= confirmations {
			return nil
		}
		select {
		case <-ctx.Done():
			return fmt.Errorf("timed out waiting for %d confirmations on block %s: %w: %w", confirmations, blockNumber, bridge.ErrNotFinal, ctx.Err())
		case <-ticker.C:
		}
	}
}

func (c *Client) TotalSupply() (*big.Int, uint64, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	blockNumber, err := c.ec.BlockNumber(ctx)
	if err != nil {
		return nil, 0, fmt.Errorf("fetching block number: %w", err)
	}

	supply, err := c.contract.TotalSupply(&bind.CallOpts{Context: ctx, BlockNumber: new(big.Int).SetUint64(blockNumber)})
	if err != nil {
		return nil, 0, fmt.Errorf("calling totalSupply: %w", err)
	}
	return supply, blockNumber, nil
}

// ValidTxHash reports whether txHash has the shape of an Ethereum transaction
// hash (0x + 32 bytes of hex), before anything bothers to ask the chain about
// it.
func (c *Client) ValidTxHash(txHash string) bool {
	if len(txHash) != 66 || txHash[:2] != "0x" && txHash[:2] != "0X" {
		return false
	}
	for _, r := range txHash[2:] {
		if !('0' <= r && r <= '9' || 'a' <= r && r <= 'f' || 'A' <= r && r <= 'F') {
			return false
		}
	}
	return true
}

// VerifyBurn is the on-chain half of H4's break-glass control: given a
// transaction hash, it proves the burn really happened before fiat is
// released. It is deliberately non-blocking — a maker-checker callback should
// answer in seconds, not park a goroutine polling finality like the saga's
// wait does — so a burn that has not reached the configured depth is reported
// as ErrBurnNotFinal and the operator proposes again later.
//
// What is checked, in order: the receipt exists and succeeded; it is for the
// USDX proxy this client is bound to; it has reached finalityDepth; and it
// contains exactly one BridgeBurned event with the right source address,
// amount and correlation id.
func (c *Client) VerifyBurn(ctx context.Context, txHash, from string, amount *big.Int, correlationID string) error {
	hash := common.HexToHash(txHash)
	receipt, err := c.ec.TransactionReceipt(ctx, hash)
	if err != nil {
		if err == ethereum.NotFound {
			return fmt.Errorf("burn %s: %w", txHash, bridge.ErrBurnNotFound)
		}
		return fmt.Errorf("fetching receipt for %s: %w", txHash, err)
	}

	if receipt.Status == 0 {
		return fmt.Errorf("burn %s reverted: %w", txHash, bridge.ErrBurnReverted)
	}
	// go-ethereum's Receipt no longer carries To; the transaction does, and a
	// burn for any contract but the USDX proxy is not our burn.
	origTx, _, err := c.ec.TransactionByHash(ctx, hash)
	if err != nil {
		return fmt.Errorf("fetching transaction %s: %w", txHash, err)
	}
	if origTx.To() == nil || !strings.EqualFold(origTx.To().Hex(), c.proxy.Hex()) {
		return &bridge.ErrBurnMismatch{Field: "contract"}
	}
	if err := c.requireFinal(ctx, receipt.BlockNumber); err != nil {
		return err
	}

	// Parse every BridgeBurned event the proxy emitted in this transaction.
	// Events from any other contract are ignored here and reported as not
	// found — the burn that matters is the proxy's own.
	var events []*gen.USDXBridgeBurned
	for i := range receipt.Logs {
		ev, perr := c.contract.ParseBridgeBurned(*receipt.Logs[i])
		if perr != nil || !strings.EqualFold(ev.Raw.Address.Hex(), c.proxy.Hex()) {
			continue
		}
		events = append(events, ev)
	}
	if len(events) == 0 {
		return fmt.Errorf("burn %s: %w: no BridgeBurned event from the USDX proxy", txHash, bridge.ErrBurnNotFound)
	}

	wantCorrelation := bridge.CorrelationIDHash(correlationID)
	matches := 0
	for _, ev := range events {
		if strings.EqualFold(ev.From.Hex(), from) && ev.Amount.Cmp(amount) == 0 && ev.CorrelationId == wantCorrelation {
			matches++
		}
	}
	switch {
	case matches == 1:
		return nil
	case matches > 1:
		// The contract's processedBurns guard makes one burn per correlation
		// id, so this is a broken chain state rather than an ordinary burn.
		return &bridge.ErrBurnMismatch{Field: "count"}
	}

	// No event matched everything. Report which field disagreed, preferring
	// the event that at least carries this correlation id.
	candidate := events[0]
	for _, ev := range events {
		if ev.CorrelationId == wantCorrelation {
			candidate = ev
			break
		}
	}
	switch {
	case !strings.EqualFold(candidate.From.Hex(), from):
		return &bridge.ErrBurnMismatch{Field: "from"}
	case candidate.Amount.Cmp(amount) != 0:
		return &bridge.ErrBurnMismatch{Field: "amount"}
	default:
		return &bridge.ErrBurnMismatch{Field: "correlation_id"}
	}
}

// requireFinal is the non-blocking form of WaitForFinality's depth check: the
// receipt is already in hand, so the question is only whether the chain has
// advanced far enough past it.
func (c *Client) requireFinal(ctx context.Context, blockNumber *big.Int) error {
	if c.finalityLevel == "finalized" {
		header, err := c.ec.HeaderByNumber(ctx, big.NewInt(rpc.FinalizedBlockNumber.Int64()))
		if err != nil {
			return fmt.Errorf("fetching finalized header: %w", err)
		}
		if header.Number.Cmp(blockNumber) < 0 {
			return fmt.Errorf("burn block %s is not final yet: %w", blockNumber, bridge.ErrBurnNotFinal)
		}
		return nil
	}

	confirmations, err := strconv.ParseUint(c.finalityLevel, 10, 64)
	if err != nil {
		return fmt.Errorf("finalityLevel must be \"finalized\" or a confirmation count, got %q", c.finalityLevel)
	}
	latest, err := c.ec.BlockNumber(ctx)
	if err != nil {
		return fmt.Errorf("fetching latest block number: %w", err)
	}
	if have := latest - blockNumber.Uint64() + 1; have < confirmations {
		return fmt.Errorf("burn block %s has %d of %d confirmations: %w", blockNumber, have, confirmations, bridge.ErrBurnNotFinal)
	}
	return nil
}
