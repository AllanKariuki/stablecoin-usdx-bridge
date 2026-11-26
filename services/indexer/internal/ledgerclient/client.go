// Package ledgerclient is the indexer's one outbound dependency: core-ledger's
// reserve endpoints.
//
// The indexer writes no balances itself. Everything it learns about money goes
// through this client into the ledger, which is the only place value exists —
// a second process with INSERT rights on a reconciliation input is a second
// place the peg can be lied to from.
//
// H2: every post carries the indexer's own Keycloak service-account token
// (svc-indexer, ledger.reserves.chain-supply), minted by
// golang.org/x/oauth2/clientcredentials and refreshed by the same library.
// core-ledger authenticates every call; there is no unauthenticated mode and
// no service-token fallback.
package ledgerclient

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"strings"
	"time"

	"golang.org/x/oauth2/clientcredentials"
)

// USDXDecimals mirrors core-ledger's currencies row for USD-X. It is here
// because the API parses amounts as decimal strings at the currency's own
// scale, so a client sending raw base units is off by exactly 10^6 in the one
// number the peg is checked against.
const USDXDecimals = 6

type Client struct {
	baseURL string
	http    *http.Client
}

// New wires the client-credentials token source onto the indexer's HTTP
// client. TokenURL is the realm's token endpoint
// (<keycloak>/realms/<realm>/protocol/openid-connect/token).
func New(baseURL, clientID, clientSecret, tokenURL string) *Client {
	config := clientcredentials.Config{
		ClientID:     clientID,
		ClientSecret: clientSecret,
		TokenURL:     tokenURL,
	}
	// cfg.Client's transport mints (and caches, until ~expiry) a token on
	// every request and attaches it as Authorization: Bearer — a failed
	// grant surfaces as a failed post, never as a silently unauthenticated
	// one.
	httpClient := config.Client(context.Background())
	httpClient.Timeout = 15 * time.Second

	return &Client{
		baseURL: strings.TrimRight(baseURL, "/"),
		http:    httpClient,
	}
}

// PostChainSupply records a chain's total supply at a height.
//
// The Idempotency-Key is derived from (chain, height) rather than generated,
// so the retry a failed post produces replays the first call instead of
// writing a second snapshot — the same discipline every money-moving write in
// this platform follows, applied to a write that is evidence rather than
// money.
func (c *Client) PostChainSupply(ctx context.Context, chain string, height uint64, blockHash string, totalSupply *big.Int) error {
	body := map[string]any{
		"chain":        chain,
		"height":       height,
		"block_hash":   blockHash,
		"total_supply": FormatDecimal(totalSupply, USDXDecimals),
		"source":       "indexer",
		"captured_at":  time.Now().UTC().Format(time.RFC3339),
	}
	key := fmt.Sprintf("chain-supply:%s:%d", chain, height)
	return c.post(ctx, "/reserves/chain-supply-snapshots", key, body)
}

func (c *Client) post(ctx context.Context, path, idempotencyKey string, body any) error {
	payload, err := json.Marshal(body)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+path, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Idempotency-Key", idempotencyKey)
	// X-User-Id is what lands in the row's `source` and in the audit trail;
	// the Authorization header is added by the oauth2 transport (see New).
	req.Header.Set("X-User-Id", "indexer")

	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return nil
	}
	detail, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
	return fmt.Errorf("core-ledger %s returned %s: %s", path, resp.Status, strings.TrimSpace(string(detail)))
}

// FormatDecimal renders base units as a decimal string, mirroring
// core-ledger's ledger.FormatDecimal. It is reimplemented rather than imported
// because that package is under core-ledger/internal/ and unimportable by
// construction — and because a nine-line function is a better dependency than
// a module boundary.
func FormatDecimal(v *big.Int, decimals int) string {
	if v == nil {
		return "0"
	}
	if decimals <= 0 {
		return v.String()
	}
	neg := ""
	digits := v.String()
	if strings.HasPrefix(digits, "-") {
		neg, digits = "-", digits[1:]
	}
	for len(digits) <= decimals {
		digits = "0" + digits
	}
	return neg + digits[:len(digits)-decimals] + "." + digits[len(digits)-decimals:]
}
