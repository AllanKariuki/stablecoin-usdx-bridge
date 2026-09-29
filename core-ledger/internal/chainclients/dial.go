// Package chainclients wires both chain clients and the router over them.
//
// Both binaries — the API and the saga worker — need the same pair, dialled
// the same way, with the same tolerance for an RPC endpoint having a bad few
// seconds at boot. Keeping that in one place is what stops the worker and the
// API from disagreeing about which contract they are talking to.
package chainclients

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/bridge"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/chainclients/ethereum"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/chainclients/signerclient"
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

	// SignerURL turns both chain clients over to services/signer. When it is
	// set, the two key fields above are ignored entirely — which is the point
	// of P6: *"no private key material in any process env or on any disk."*
	//
	// The P2 Signer seam is what makes this an adapter swap rather than a
	// rewrite. Neither bridge.ChainClient nor the saga changes.
	SignerURL      string
	SignerCertPath string
	SignerKeyPath  string
	SignerCAPath   string
	SignerEthKeyID string
	SignerSolKeyID string
}

type Clients struct {
	Ethereum *ethereum.Client
	Solana   *solana.Client
	Router   *bridge.Router
}

func Dial(logger *slog.Logger, p Params) (*Clients, error) {
	var signer *signerclient.Client
	if p.SignerURL != "" {
		var err error
		signer, err = signerclient.New(p.SignerURL, p.SignerCertPath, p.SignerKeyPath, p.SignerCAPath)
		if err != nil {
			return nil, fmt.Errorf("connecting to the signer: %w", err)
		}
		if p.SignerCertPath == "" {
			// Loud, because it is the difference between "the keys are in a
			// vault" and "the keys are in a vault anyone on the network can
			// ask". The signer refuses to start this way outside local
			// development; this is the client side of the same warning.
			logger.Warn("talking to the signer WITHOUT a client certificate — local development only",
				slog.String("signer_url", p.SignerURL))
		}
		logger.Info("chain signing delegated to services/signer; no key material is held in this process",
			slog.String("signer_url", p.SignerURL))
	}

	var eth *ethereum.Client
	if err := retryDial(logger, "ethereum", func() (err error) {
		if signer != nil {
			var remote ethereum.Signer
			remote, err = ethereum.NewRemoteSigner(context.Background(), signer, orDefault(p.SignerEthKeyID, "eth-relayer"))
			if err != nil {
				return err
			}
			eth, err = ethereum.NewClientWithSigner(p.EthRPCURL, p.USDXProxyAddress, remote)
			return err
		}
		eth, err = ethereum.NewClient(p.EthRPCURL, p.USDXProxyAddress, p.EthRelayerPrivKey)
		return err
	}); err != nil {
		return nil, fmt.Errorf("connecting to ethereum: %w", err)
	}
	logger.Info("connected to ethereum network")

	var sol *solana.Client
	if err := retryDial(logger, "solana", func() (err error) {
		if signer != nil {
			var remote solana.Signer
			remote, err = solana.NewRemoteSigner(context.Background(), signer, orDefault(p.SignerSolKeyID, "sol-relayer"))
			if err != nil {
				return err
			}
			sol, err = solana.NewClientWithSigner(p.SolanaRPCURL, p.USDXProgramID, p.USDXMintAddress, remote)
			return err
		}
		sol, err = solana.NewClient(p.SolanaRPCURL, p.USDXProgramID, p.USDXMintAddress, p.SolanaRelayerKeypairPath)
		return err
	}); err != nil {
		return nil, fmt.Errorf("connecting to solana: %w", err)
	}
	logger.Info("connected to solana network")

	return &Clients{Ethereum: eth, Solana: sol, Router: bridge.NewRouter(eth, sol)}, nil
}

func orDefault(v, fallback string) string {
	if v == "" {
		return fallback
	}
	return v
}

// CustodyAddress reports the platform's own on-chain address for a chain it
// custodies balances on, so a wallet created for that chain is stamped with an
// address the bridge can actually burn from.
//
// Only Solana answers. Ethereum's bridgeBurn works against any holder under
// BRIDGE_ROLE, so an Ethereum USD-X wallet keeps the user's own address —
// self-custody there costs nothing and is already possible.
func (c *Clients) CustodyAddress(chain string) (string, bool) {
	if chain == "SOLANA" {
		return c.Solana.CustodyAddress(), true
	}
	return "", false
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
