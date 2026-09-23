// Package identityclient resolves a verified token's subject (Keycloak's
// opaque "sub") to the party_id core-ledger and every other service treat
// as the real user identity — see docs/building-plan.md's P1 "Identity is
// three layers" decision: Keycloak owns the credential, services/identity
// owns the party, and Keycloak's sub never reaches the ledger.
package identityclient

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/redis/go-redis/v9"
)

// Resolver turns a verified subject into a party_id (and, if the caller
// belongs to an organization, an org_id).
type Resolver interface {
	Resolve(ctx context.Context, subject string) (partyID, orgID string, err error)
}

// SubjectPassthroughResolver treats the Keycloak subject as the party id
// directly. This is a deliberate, temporary seam: services/identity (the
// real owner of the party_id mapping) is separate follow-on work, and
// auth-proxy needs to be correct and usable before that service exists. Once
// IdentityHTTPResolver is configured (IDENTITY_SERVICE_URL set), this is
// never used in a real deployment — see main.go's resolver selection.
type SubjectPassthroughResolver struct{}

func (SubjectPassthroughResolver) Resolve(_ context.Context, subject string) (string, string, error) {
	return subject, "", nil
}

// IdentityHTTPResolver calls services/identity's internal lookup endpoint
// and caches the result in Redis — auth-proxy owns no database of its own
// (see the service table in docs/building-plan.md: "nothing (Redis
// cache)"), so every uncached request costs one identity round trip.
type IdentityHTTPResolver struct {
	baseURL string
	http    *http.Client
	redis   *redis.Client
	ttl     time.Duration
}

func NewIdentityHTTPResolver(baseURL string, redisClient *redis.Client, ttl time.Duration) *IdentityHTTPResolver {
	if ttl <= 0 {
		ttl = 5 * time.Minute
	}
	return &IdentityHTTPResolver{
		baseURL: baseURL,
		http:    &http.Client{Timeout: 5 * time.Second},
		redis:   redisClient,
		ttl:     ttl,
	}
}

type partyLookup struct {
	PartyID string `json:"party_id"`
	OrgID   string `json:"org_id"`
}

func cacheKey(subject string) string { return "authproxy:party:" + subject }

func (r *IdentityHTTPResolver) Resolve(ctx context.Context, subject string) (string, string, error) {
	if r.redis != nil {
		if cached, err := r.redis.Get(ctx, cacheKey(subject)).Result(); err == nil {
			var pl partyLookup
			if json.Unmarshal([]byte(cached), &pl) == nil {
				return pl.PartyID, pl.OrgID, nil
			}
		}
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, r.baseURL+"/internal/parties/by-subject/"+subject, nil)
	if err != nil {
		return "", "", err
	}
	resp, err := r.http.Do(req)
	if err != nil {
		return "", "", fmt.Errorf("calling identity service: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return "", "", fmt.Errorf("identity service returned %d: %s", resp.StatusCode, body)
	}

	var pl partyLookup
	if err := json.NewDecoder(resp.Body).Decode(&pl); err != nil {
		return "", "", fmt.Errorf("decoding identity response: %w", err)
	}

	if r.redis != nil {
		if encoded, err := json.Marshal(pl); err == nil {
			r.redis.Set(ctx, cacheKey(subject), encoded, r.ttl)
		}
	}

	return pl.PartyID, pl.OrgID, nil
}
