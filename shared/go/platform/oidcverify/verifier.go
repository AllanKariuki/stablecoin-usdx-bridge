// Package oidcverify wraps go-oidc's OIDC discovery + cached, auto-rotating
// JWKS lookup and Keycloak's realm_access/resource_access claim shapes into
// the one call a service boundary needs: turn a raw bearer token into a
// verified subject + role list, or reject it.
//
// It moved out of services/auth-proxy/internal when core-ledger (H2) started
// authenticating its own service-to-service calls with the same verifier.
// auth-proxy reads the realm roles; core-ledger reads the client roles a
// service-account token carries in resource_access — one verifier, two
// audiences.
package oidcverify

import (
	"context"
	"fmt"
	"strings"

	"github.com/coreos/go-oidc/v3/oidc"
)

// Claims is what a verified token is normalized down to — deliberately
// narrow rather than exposing the full claim set, so a handler can't
// accidentally come to depend on a Keycloak-specific claim this package
// doesn't already normalize.
type Claims struct {
	Subject string   // the Keycloak "sub" — an opaque credential id, never forwarded to core-ledger directly (see services/identity's party mapping)
	Roles   []string // realm_access.roles

	// ClientRoles is resource_access.<client>.roles: the client roles the
	// token's audience(s) granted the token's own client. Empty for a
	// customer's token minted for a public SPA client.
	ClientRoles map[string][]string
	// AuthorizedParty is azp — the client that obtained the token. For a
	// service-account token this is the service's own client id, which is
	// what core-ledger stamps as "service:<azp>" when a call carries no
	// X-User-Id.
	AuthorizedParty string
}

// HasClientRole reports whether the token carries the given role for the
// given client — i.e. resource_access[client].roles contains role.
func (c *Claims) HasClientRole(client, role string) bool {
	for _, r := range c.ClientRoles[client] {
		if r == role {
			return true
		}
	}
	return false
}

// Verifier verifies a bearer token's signature (against the issuer's JWKS,
// fetched via OIDC discovery and cached/rotated by go-oidc), issuer,
// audience, and expiry.
type Verifier struct {
	idTokenVerifier *oidc.IDTokenVerifier
}

// New performs OIDC discovery against issuerURL (e.g.
// http://localhost:8080/realms/damp) and configures verification against
// audience. audience must match a Keycloak client with the `aud` mapper
// enabled — without it, a public client's tokens carry aud: ["account"] and
// every request is rejected (see docs/building-plan.md's P1 section).
func New(ctx context.Context, issuerURL, audience string) (*Verifier, error) {
	provider, err := oidc.NewProvider(ctx, issuerURL)
	if err != nil {
		return nil, fmt.Errorf("oidc discovery against %s: %w", issuerURL, err)
	}
	return &Verifier{
		idTokenVerifier: provider.Verifier(&oidc.Config{ClientID: audience}),
	}, nil
}

// newForTesting builds a Verifier against an explicit provider config,
// bypassing discovery — used by tests that stand up a fake issuer and
// don't want discovery's own caching to leak between test cases.
func newForTesting(v *oidc.IDTokenVerifier) *Verifier {
	return &Verifier{idTokenVerifier: v}
}

// keycloakClaims mirrors the claim shapes this package reads out of a
// Keycloak token: realm_access.roles for a user's realm roles and
// resource_access.<client>.roles for the client roles a service-account
// token carries (plus azp, the client that obtained the token).
type keycloakClaims struct {
	RealmAccess struct {
		Roles []string `json:"roles"`
	} `json:"realm_access"`
	ResourceAccess map[string]struct {
		Roles []string `json:"roles"`
	} `json:"resource_access"`
	AuthorizedParty string `json:"azp"`
}

// Verify checks signature, issuer, audience, and expiry, then extracts the
// subject, realm roles and client roles. Any failure (bad signature,
// expired, wrong issuer/audience, malformed claims) is returned as a single
// opaque error — callers should treat every case as "reject with 401", not
// branch on which check failed, since revealing that distinction to a
// caller is exactly the kind of oracle an authentication boundary shouldn't
// offer.
func (v *Verifier) Verify(ctx context.Context, rawToken string) (*Claims, error) {
	idToken, err := v.idTokenVerifier.Verify(ctx, rawToken)
	if err != nil {
		return nil, fmt.Errorf("token verification failed: %w", err)
	}

	var kc keycloakClaims
	if err := idToken.Claims(&kc); err != nil {
		return nil, fmt.Errorf("decoding keycloak claims: %w", err)
	}

	clientRoles := make(map[string][]string, len(kc.ResourceAccess))
	for client, access := range kc.ResourceAccess {
		if len(access.Roles) > 0 {
			clientRoles[client] = access.Roles
		}
	}

	return &Claims{
		Subject:         idToken.Subject,
		Roles:           kc.RealmAccess.Roles,
		ClientRoles:     clientRoles,
		AuthorizedParty: kc.AuthorizedParty,
	}, nil
}

// BearerToken extracts the token from an Authorization header ("Bearer
// <token>"), or returns "" when the header carries no bearer token. The one
// shared way both auth boundaries (auth-proxy, core-ledger) read the
// header, so a malformed-header edge case cannot be fixed in one and left
// in the other.
func BearerToken(header string) string {
	const prefix = "Bearer "
	if !strings.HasPrefix(header, prefix) {
		return ""
	}
	return strings.TrimSpace(strings.TrimPrefix(header, prefix))
}
