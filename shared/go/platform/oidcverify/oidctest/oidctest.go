// Package oidctest stands up a fake OIDC issuer (discovery document + JWKS
// endpoint) and signs tokens against it, so a service's tests can exercise
// real signature/issuer/audience/expiry verification through go-oidc
// without a live Keycloak.
//
// It moved out of services/auth-proxy/internal/testoidc when the verifier
// moved into shared/go/platform/oidcverify, so core-ledger's auth tests can
// use the same fake issuer auth-proxy's do.
package oidctest

import (
	"crypto/rand"
	"crypto/rsa"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-jose/go-jose/v4"
	"github.com/golang-jwt/jwt/v5"
)

const KeyID = "test-key-1"

type Server struct {
	*httptest.Server
	key *rsa.PrivateKey
}

// New starts the fake issuer. Callers must Close() it (deferred) — it's a
// real httptest.Server.
func New(t *testing.T) *Server {
	t.Helper()

	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generating test RSA key: %v", err)
	}

	s := &Server{key: key}
	mux := http.NewServeMux()
	mux.HandleFunc("/.well-known/openid-configuration", s.discovery)
	mux.HandleFunc("/jwks", s.jwks)
	s.Server = httptest.NewServer(mux)

	t.Cleanup(s.Server.Close)
	return s
}

func (s *Server) discovery(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"issuer":                                s.URL,
		"jwks_uri":                              s.URL + "/jwks",
		"authorization_endpoint":                s.URL + "/auth",
		"token_endpoint":                        s.URL + "/token",
		"id_token_signing_alg_values_supported": []string{"RS256"},
	})
}

func (s *Server) jwks(w http.ResponseWriter, r *http.Request) {
	jwk := jose.JSONWebKey{
		Key:       &s.key.PublicKey,
		KeyID:     KeyID,
		Algorithm: "RS256",
		Use:       "sig",
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(jose.JSONWebKeySet{Keys: []jose.JSONWebKey{jwk}})
}

// Claims lets a test override the defaults SignToken fills in (subject,
// audience, expiry, azp, realm/client roles) — only what's set is
// overridden.
type Claims struct {
	Subject string
	Roles   []string
	// ClientRoles is minted as resource_access.<client>.roles, the shape
	// Keycloak puts a service-account's client roles in.
	ClientRoles map[string][]string
	// Azp is minted as the azp claim — the client that obtained the token.
	Azp     string
	Expires time.Time
}

// SignToken produces an RS256-signed access token in Keycloak's shape:
// standard iss/aud/sub/exp plus realm_access.roles, resource_access and azp
// when the test sets them.
func (s *Server) SignToken(t *testing.T, audience string, c Claims) string {
	t.Helper()

	if c.Subject == "" {
		c.Subject = "test-subject"
	}
	if c.Expires.IsZero() {
		c.Expires = time.Now().Add(time.Hour)
	}

	claims := jwt.MapClaims{
		"iss": s.URL,
		"aud": audience,
		"sub": c.Subject,
		"exp": c.Expires.Unix(),
		"iat": time.Now().Unix(),
		"realm_access": map[string]any{
			"roles": c.Roles,
		},
	}
	if c.Azp != "" {
		claims["azp"] = c.Azp
	}
	if len(c.ClientRoles) > 0 {
		resourceAccess := make(map[string]any, len(c.ClientRoles))
		for client, roles := range c.ClientRoles {
			resourceAccess[client] = map[string]any{"roles": roles}
		}
		claims["resource_access"] = resourceAccess
	}

	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	token.Header["kid"] = KeyID

	signed, err := token.SignedString(s.key)
	if err != nil {
		t.Fatalf("signing test token: %v", err)
	}
	return signed
}
