package oidcverify_test

import (
	"context"
	"testing"
	"time"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/auth-proxy/internal/oidcverify"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/auth-proxy/internal/testoidc"
)

const testAudience = "damp-portal"

func TestVerify_ValidTokenReturnsSubjectAndRoles(t *testing.T) {
	issuer := testoidc.New(t)
	verifier, err := oidcverify.New(context.Background(), issuer.URL, testAudience)
	if err != nil {
		t.Fatalf("discovery: %v", err)
	}

	token := issuer.SignToken(t, testAudience, testoidc.Claims{
		Subject: "alice-sub",
		Roles:   []string{"customer", "auditor"},
	})

	claims, err := verifier.Verify(context.Background(), token)
	if err != nil {
		t.Fatalf("expected a valid token to verify, got: %v", err)
	}
	if claims.Subject != "alice-sub" {
		t.Errorf("expected subject alice-sub, got %q", claims.Subject)
	}
	if len(claims.Roles) != 2 || claims.Roles[0] != "customer" || claims.Roles[1] != "auditor" {
		t.Errorf("expected roles [customer auditor], got %v", claims.Roles)
	}
}

func TestVerify_ExpiredTokenRejected(t *testing.T) {
	issuer := testoidc.New(t)
	verifier, err := oidcverify.New(context.Background(), issuer.URL, testAudience)
	if err != nil {
		t.Fatalf("discovery: %v", err)
	}

	token := issuer.SignToken(t, testAudience, testoidc.Claims{
		Expires: time.Now().Add(-time.Hour),
	})

	if _, err := verifier.Verify(context.Background(), token); err == nil {
		t.Fatal("expected an expired token to be rejected")
	}
}

func TestVerify_WrongAudienceRejected(t *testing.T) {
	issuer := testoidc.New(t)
	verifier, err := oidcverify.New(context.Background(), issuer.URL, testAudience)
	if err != nil {
		t.Fatalf("discovery: %v", err)
	}

	// Without the `aud` mapper configured, Keycloak issues aud: ["account"]
	// for a public client — exactly the failure mode
	// docs/building-plan.md's P1 section calls out as "the single most
	// likely day-one bug". This must not verify.
	token := issuer.SignToken(t, "account", testoidc.Claims{})

	if _, err := verifier.Verify(context.Background(), token); err == nil {
		t.Fatal("expected a token with the wrong audience to be rejected")
	}
}

func TestVerify_TamperedSignatureRejected(t *testing.T) {
	issuer := testoidc.New(t)
	verifier, err := oidcverify.New(context.Background(), issuer.URL, testAudience)
	if err != nil {
		t.Fatalf("discovery: %v", err)
	}

	token := issuer.SignToken(t, testAudience, testoidc.Claims{})
	tampered := token[:len(token)-4] + "abcd"

	if _, err := verifier.Verify(context.Background(), tampered); err == nil {
		t.Fatal("expected a tampered signature to be rejected")
	}
}

func TestVerify_WrongIssuerRejected(t *testing.T) {
	issuerA := testoidc.New(t)
	issuerB := testoidc.New(t)

	verifier, err := oidcverify.New(context.Background(), issuerA.URL, testAudience)
	if err != nil {
		t.Fatalf("discovery: %v", err)
	}

	// Signed by issuer B's key but claiming issuer A — signature alone
	// isn't enough; go-oidc must reject on the "iss" mismatch too, since
	// issuerB.SignToken embeds issuerB.URL as "iss" while being verified
	// against issuerA's verifier.
	token := issuerB.SignToken(t, testAudience, testoidc.Claims{})

	if _, err := verifier.Verify(context.Background(), token); err == nil {
		t.Fatal("expected a token from a different issuer to be rejected")
	}
}
