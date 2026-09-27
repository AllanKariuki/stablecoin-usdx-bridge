// Package chainclients wires both chain clients and the router over them.
//
// Both binaries — the API and the saga worker — need the same pair, dialled
// the same way, with the same tolerance for an RPC endpoint having a bad few
// seconds at boot. Keeping that in one place is what stops the worker and the
// API from disagreeing about which contract they are talking to.
package chainclients

import (
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/bridge"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/chainclients/ethereum"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/chainclients/solana"
)

type Params struct {
	EthRPCURL         string
	USDXProxyAddress  string
	EthRelayerPrivKey string

	SolanaRPCURL             string
	USDXProgramID            string
	USDXMintAddress          string
	SolanaRelayerKeypairPath string
}

type Clients struct {
	Ethereum *ethereum.Client
	Solana   *solana.Client
	Router   *bridge.Router
}

func Dial(logger *slog.Logger, p Params) (*Clients, error) {
	var eth *ethereum.Client
	if err := retryDial(logger, "ethereum", func() (err error) {
		eth, err = ethereum.NewClient(p.EthRPCURL, p.USDXProxyAddress, p.EthRelayerPrivKey)
		return err
	}); err != nil {
		return nil, fmt.Errorf("connecting to ethereum: %w", err)
	}
	logger.Info("connected to ethereum network")

	var sol *solana.Client
	if err := retryDial(logger, "solana", func() (err error) {
		sol, err = solana.NewClient(p.SolanaRPCURL, p.USDXProgramID, p.USDXMintAddress, p.SolanaRelayerKeypairPath)
		return err
	}); err != nil {
		return nil, fmt.Errorf("connecting to solana: %w", err)
	}
	logger.Info("connected to solana network")

	return &Clients{Ethereum: eth, Solana: sol, Router: bridge.NewRouter(eth, sol)}, nil
}

// retryDial bounds how long boot waits on a flaky chain RPC endpoint before
// giving up, so a single transient blip doesn't turn an equally transient
// outage into a hard boot failure.
func retryDial(logger *slog.Logger, label string, connect func() error) error {
	const maxAttempts = 5
	const maxBackoff = 30 * time.Second
	backoff := 2 * time.Second

	var lastErr error
	for attempt := 1; attempt <= maxAttempts; attempt++ {
		if err := connect(); err == nil {
			return nil
		} else {
			lastErr = err
		}
		if attempt == maxAttempts {
			break
		}
		logger.Warn("chain connection attempt failed, retrying",
			slog.String("chain", label), slog.Int("attempt", attempt), slog.Int("max_attempts", maxAttempts),
			slog.Duration("backoff", backoff), slog.Any("error", lastErr))
		time.Sleep(backoff)
		backoff *= 2
		if backoff > maxBackoff {
			backoff = maxBackoff
		}
	}
	return errors.Join(lastErr, fmt.Errorf("%s: gave up after %d attempts", label, maxAttempts))
}
