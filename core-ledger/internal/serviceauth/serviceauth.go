// Package serviceauth builds the HTTP client the worker uses for its
// outbound service-to-service calls after H3: every request mints (and
// caches, until ~expiry) a Keycloak client-credentials token for the
// svc-core-ledger-worker service account and attaches it as
// Authorization: Bearer. A failed grant surfaces as a failed request, never
// as a silently unauthenticated one.
//
// Only the worker binary uses this — the API server and reconcile are
// receivers or chain-tooling, not callers, which is why the config it needs
// (SERVICE_CLIENT_ID/SECRET, KEYCLOAK_BASE_URL/REALM) lives in core-ledger's
// Config as optional fields.
package serviceauth

import (
	"context"
	"fmt"
	"net/http"

	"golang.org/x/oauth2/clientcredentials"
)

// Client returns an *http.Client whose transport mints the service-account
// token on every request — the same wiring services/indexer uses for its
// own core-ledger calls (internal/ledgerclient). tokenURL is derived from
// the Keycloak base URL and realm, so a misconfigured base URL fails loudly
// at boot rather than 404ing later.
func Client(clientID, clientSecret, keycloakBaseURL, realm string) (*http.Client, error) {
	if clientID == "" || clientSecret == "" {
		return nil, fmt.Errorf("SERVICE_CLIENT_ID and SERVICE_CLIENT_SECRET are required for the worker's service-to-service calls (H3)")
	}
	tokenURL := fmt.Sprintf("%s/realms/%s/protocol/openid-connect/token", keycloakBaseURL, realm)
	config := clientcredentials.Config{
		ClientID:     clientID,
		ClientSecret: clientSecret,
		TokenURL:     tokenURL,
	}
	return config.Client(context.Background()), nil
}
