// Package signerclient talks to services/signer over mutually-authenticated
// TLS.
//
// This is the P2 seam finally being used. `ethereum.Signer` and
// `solana.Signer` were introduced two phases ago with nothing behind them but
// an in-process key, precisely so that this would be an adapter rather than a
// rewrite — and it is: `bridge.ChainClient` does not change, the saga does not
// change, and core-ledger stops holding ETH_RELAYER_PRIVATE_KEY.
package signerclient

import (
	"bytes"
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"os"
	"strings"
	"time"
)

// Client is the transport. One per process; it is safe for concurrent use.
type Client struct {
	baseURL string
	http    *http.Client
}

// New dials the signer with a client certificate.
//
// The certificate is not optional outside local development, and the reason
// is worth being explicit about: the signer authenticates its caller *only*
// by the certificate that completed the handshake. There is no token to fall
// back on, deliberately — a bearer token can be replayed by anyone who
// observes one, and the thing being authorised here is mint authority.
func New(baseURL, certPath, keyPath, caPath string) (*Client, error) {
	transport := &http.Transport{
		MaxIdleConnsPerHost: 4,
		// Keep-alives matter more than usual here: a TLS 1.3 handshake with
		// client authentication on every signature would add a round trip to
		// the critical path of every mint.
		IdleConnTimeout: 90 * time.Second,
	}

	if certPath != "" && keyPath != "" && caPath != "" {
		cert, err := tls.LoadX509KeyPair(certPath, keyPath)
		if err != nil {
			return nil, fmt.Errorf("loading the signer client certificate: %w", err)
		}
		caPEM, err := os.ReadFile(caPath)
		if err != nil {
			return nil, fmt.Errorf("reading the signer CA: %w", err)
		}
		pool := x509.NewCertPool()
		if !pool.AppendCertsFromPEM(caPEM) {
			return nil, fmt.Errorf("no certificates found in %s", caPath)
		}
		transport.TLSClientConfig = &tls.Config{
			Certificates: []tls.Certificate{cert},
			RootCAs:      pool,
			MinVersion:   tls.VersionTLS13,
		}
	}

	return &Client{
		baseURL: strings.TrimRight(baseURL, "/"),
		// Generous, because a Fireblocks-backed signer may be waiting on an
		// approval policy. The saga's own retry budget is what bounds the
		// total wait; a short timeout here would just turn a slow approval
		// into a failed mint.
		http: &http.Client{Transport: transport, Timeout: 60 * time.Second},
	}, nil
}

// SignRequest is what the signer needs: the bytes to sign, and enough of the
// decoded transaction for policy to have an opinion about it.
//
// The decoded fields travel alongside the digest rather than being derived
// from it because a digest cannot be inspected — an amount ceiling against 32
// bytes of hash is meaningless. That is the whole reason the P2 Signer
// interface takes a transaction rather than a digest.
type SignRequest struct {
	Chain         string
	Method        string
	KeyID         string
	Digest        []byte
	Amount        *big.Int
	Destination   string
	CorrelationID string
}

type SignResult struct {
	Signature []byte
	PublicKey string
	AuditID   string
	Replayed  bool
}

// Sign asks for a signature.
//
// A refusal (403) is returned as PolicyDeniedError, which the saga's error
// classifier treats as terminal: a policy denial will deny identically on
// every retry, and burning an attempt budget on it only delays the moment
// somebody looks at the dead letter.
func (c *Client) Sign(ctx context.Context, req SignRequest) (*SignResult, error) {
	amount := ""
	if req.Amount != nil {
		amount = req.Amount.String()
	}

	body, err := json.Marshal(map[string]any{
		"chain":          req.Chain,
		"method":         req.Method,
		"key_id":         req.KeyID,
		"digest":         hex.EncodeToString(req.Digest),
		"amount":         amount,
		"destination":    req.Destination,
		"correlation_id": req.CorrelationID,
	})
	if err != nil {
		return nil, err
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/sign", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("calling the signer: %w", err)
	}
	defer resp.Body.Close()

	payload, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, err
	}

	if resp.StatusCode == http.StatusForbidden {
		var envelope struct {
			Error string `json:"error"`
			Code  string `json:"code"`
		}
		_ = json.Unmarshal(payload, &envelope)
		return nil, &PolicyDeniedError{Reason: envelope.Error}
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("the signer returned %s: %s", resp.Status, strings.TrimSpace(string(payload)))
	}

	var out struct {
		Signature string `json:"signature"`
		PublicKey string `json:"public_key"`
		AuditID   string `json:"audit_id"`
		Replayed  bool   `json:"replayed"`
	}
	if err := json.Unmarshal(payload, &out); err != nil {
		return nil, err
	}
	signature, err := hex.DecodeString(out.Signature)
	if err != nil {
		return nil, fmt.Errorf("the signer returned a signature that is not hex: %w", err)
	}

	return &SignResult{
		Signature: signature,
		PublicKey: out.PublicKey,
		AuditID:   out.AuditID,
		Replayed:  out.Replayed,
	}, nil
}

// Keys lists what the signer holds. Used at boot to learn the relayer
// addresses, which core-ledger no longer derives from a key it holds.
func (c *Client) Keys(ctx context.Context) (map[string]string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/keys", nil)
	if err != nil {
		return nil, err
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("listing signer keys: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("the signer returned %s listing keys", resp.Status)
	}

	var out struct {
		Keys []struct {
			ID        string `json:"id"`
			PublicKey string `json:"public_key"`
		} `json:"keys"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}

	keys := make(map[string]string, len(out.Keys))
	for _, k := range out.Keys {
		keys[k.ID] = k.PublicKey
	}
	return keys, nil
}

// PolicyDeniedError is a refusal, not a failure.
//
// The distinction matters to the saga: a denial is deterministic and will
// deny identically on every retry, so it is classified terminal. Retrying it
// eleven times before dead-lettering only delays the moment an operator sees
// the reason.
type PolicyDeniedError struct {
	Reason string
}

func (e *PolicyDeniedError) Error() string {
	return "the signer refused: " + e.Reason
}
