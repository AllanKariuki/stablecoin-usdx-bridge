// Package oidcverify wraps go-oidc's OIDC discovery + cached, auto-rotating
// JWKS lookup and Keycloak's realm_access.roles claim shape into the one
// call auth-proxy actually needs: turn a raw bearer token into a verified
// subject + role list, or reject it.
package oidcverify

import (
	"context"
	"fmt"

	"github.com/coreos/go-oidc/v3/oidc"
)

// Claims is what auth-proxy needs out of a verified token — deliberately
// narrow rather than exposing the full claim set, so a handler can't
// accidentally come to depend on a Keycloak-specific claim this package
// doesn't already normalize.
type Claims struct {
	Subject string   // the Keycloak "sub" — an opaque credential id, never forwarded to core-ledger directly (see services/identity's party mapping)
	Roles   []string // realm_access.roles
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

// keycloakRealmAccess mirrors the one shape auth-proxy actually reads out
// of a Keycloak token: realm_access.roles. Client roles and resource_access
// are deliberately not read here — see docs/building-plan.md: "the 6 realm
// roles" is the whole model, no client-scoped role split.
type keycloakRealmAccess struct {
	RealmAccess struct {
		Roles []string `json:"roles"`
	} `json:"realm_access"`
}

// Verify checks signature, issuer, audience, and expiry, then extracts the
// subject and realm roles. Any failure (bad signature, expired, wrong
// issuer/audience, malformed claims) is returned as a single opaque error —
// callers should treat every case as "reject with 401", not branch on which
// check failed, since revealing that distinction to a caller is exactly the
// kind of oracle an authentication boundary shouldn't offer.
func (v *Verifier) Verify(ctx context.Context, rawToken string) (*Claims, error) {
	idToken, err := v.idTokenVerifier.Verify(ctx, rawToken)
	if err != nil {
		return nil, fmt.Errorf("token verification failed: %w", err)
	}

	var kc keycloakRealmAccess
	if err := idToken.Claims(&kc); err != nil {
		return nil, fmt.Errorf("decoding realm_access claim: %w", err)
	}

	return &Claims{
		Subject: idToken.Subject,
		Roles:   kc.RealmAccess.Roles,
	}, nil
}
