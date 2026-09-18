package ethereum

import (
	"context"
	"crypto/ecdsa"
	"fmt"
	"math/big"
	"strconv"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"
	"github.com/ethereum/go-ethereum/rpc"

	"core-ledger/internal/bridge"
	"core-ledger/internal/chainclients/ethereum/gen"
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
	relayer  *ecdsa.PrivateKey
}

// NewClient dials rpcURL and binds to the USDX proxy at contractAddress
// (USDX_PROXY_ADDRESS — never the bare implementation address, see
// chains/ethereum/script/USDX.s.sol). relayerKeyHex is the hex-encoded
// private key for the address holding BRIDGE_ROLE, the only account
// allowed to call bridgeMint/bridgeBurn.
func NewClient(rpcURL, contractAddress, relayerKeyHex string) (*Client, error) {
	ec, err := ethclient.Dial(rpcURL)
	if err != nil {
		return nil, fmt.Errorf("dialing ethereum rpc: %w", err)
	}

	contract, err := gen.NewUSDX(common.HexToAddress(contractAddress), ec)
	if err != nil {
		return nil, fmt.Errorf("binding USDX contract: %w", err)
	}

	key, err := crypto.HexToECDSA(strings.TrimPrefix(relayerKeyHex, "0x"))
	if err != nil {
		return nil, fmt.Errorf("parsing relayer private key: %w", err)
	}

	chainID, err := ec.ChainID(context.Background())
	if err != nil {
		return nil, fmt.Errorf("fetching chain id: %w", err)
	}

	return &Client{ec: ec, contract: contract, chainID: chainID, relayer: key}, nil
}

func (c *Client) transactor(ctx context.Context) (*bind.TransactOpts, error) {
	opts, err := bind.NewKeyedTransactorWithChainID(c.relayer, c.chainID)
	if err != nil {
		return nil, fmt.Errorf("building transactor: %w", err)
	}
	opts.Context = ctx
	return opts, nil
}

func (c *Client) BridgeMint(to string, amount *big.Int, correlationID string) (string, error) {
	opts, err := c.transactor(context.Background())
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
	opts, err := c.transactor(context.Background())
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
		return fmt.Errorf("tx %s reverted", txHash)
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
			return fmt.Errorf("fetching finalized header: %w", err)
		}
		if header.Number.Cmp(blockNumber) >= 0 {
			return nil
		}
		select {
		case <-ctx.Done():
			return fmt.Errorf("timed out waiting for block %s to finalize: %w", blockNumber, ctx.Err())
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
			return fmt.Errorf("fetching latest block number: %w", err)
		}
		have := latest - blockNumber.Uint64() + 1
		if have >= confirmations {
			return nil
		}
		select {
		case <-ctx.Done():
			return fmt.Errorf("timed out waiting for %d confirmations on block %s: %w", confirmations, blockNumber, ctx.Err())
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
