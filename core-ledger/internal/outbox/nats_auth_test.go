package outbox

import (
	"os"
	"strings"
	"testing"
	"time"

	"github.com/nats-io/nats.go"
)

// The H7 NATS broker authenticates one user per service and each user may
// publish only its own subjects (infra/nats/nats.conf). These tests prove
// the permissions do what the comments in that file promise, against a real
// broker:
//
//	NATS_TEST_URL=nats://localhost:54222 \
//	  go test ./internal/outbox -run TestNATSAuth -v
//
// Skipped without NATS_TEST_URL — an unauthenticated broker would make
// every "must be refused" assertion below fail, which is exactly why the
// suite refuses to guess. The passwords default to docker-compose's dev
// values so the suite runs against the local stack unmodified.
func natsTestConn(t *testing.T, user, password string) (*nats.Conn, error) {
	t.Helper()
	return nats.Connect(os.Getenv("NATS_TEST_URL"),
		nats.UserInfo(user, password),
		nats.Name("nats-auth-test"),
		// Auth failures are terminal; don't make the test wait out the
		// default retry budget to learn it.
		nats.MaxReconnects(2),
		nats.ReconnectWait(100*time.Millisecond),
		nats.Timeout(2*time.Second),
	)
}

func testPassword(t *testing.T, envVar, dev string) string {
	t.Helper()
	if v := os.Getenv(envVar); v != "" {
		return v
	}
	return dev
}

func permissionsErr(t *testing.T, nc *nats.Conn) string {
	t.Helper()
	// A permission violation is an async -ERR from the server: Publish
	// succeeds locally and the refusal surfaces on Flush or LastError.
	err := nc.Flush()
	if err == nil {
		err = nc.LastError()
	}
	if err == nil {
		return ""
	}
	if !strings.Contains(err.Error(), "Permissions Violation") {
		t.Fatalf("expected a permissions violation, got %v", err)
	}
	return err.Error()
}

// Wrong credentials must refuse the connection outright — a service whose
// password is wrong must fail loudly at connect, not connect and discover
// permission errors one publish at a time.
func TestNATSAuthWrongPasswordIsRefused(t *testing.T) {
	if os.Getenv("NATS_TEST_URL") == "" {
		t.Skipf("NATS_TEST_URL is not set")
	}
	nc, err := natsTestConn(t, "core-ledger", "definitely-not-the-password")
	if err == nil {
		nc.Close()
		t.Fatal("connected with a wrong password")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "authorization") {
		t.Fatalf("wrong-password error = %v, want an authorization error", err)
	}
}

// Each user may publish only its own subjects. The three denials below are
// the whole point of the permissions file: core-ledger writes damp.> and
// nothing else; notifications writes live pushes and never ledger subjects;
// compliance writes nothing but its consumer's API/ack traffic.
func TestNATSAuthPublishPermissions(t *testing.T) {
	if os.Getenv("NATS_TEST_URL") == "" {
		t.Skipf("NATS_TEST_URL is not set")
	}

	cases := []struct {
		name    string
		user    string
		subject string
		wantErr bool
	}{
		{"core-ledger may publish damp.>", "core-ledger", "damp.test.nats_auth_probe.v1", false},
		{"core-ledger may not publish outside damp.>", "core-ledger", "live.notifications.push.v1", true},
		{"notifications may publish its live-push subject", "notifications", "live.notifications.push.v1", false},
		{"notifications may not publish damp.>", "notifications", "damp.test.nats_auth_probe.v1", true},
		{"compliance may not publish damp.>", "compliance", "damp.ledger.chain_enforcement_finalized.v1", true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			nc, err := natsTestConn(t, tc.user, testPassword(t, "NATS_TEST_"+strings.ToUpper(strings.ReplaceAll(tc.user, "-", "_"))+"_PASSWORD",
				map[string]string{
					"core-ledger":   "dev-core-ledger-password",
					"notifications": "dev-notifications-password",
					"compliance":    "dev-compliance-password",
				}[tc.user]))
			if err != nil {
				t.Fatalf("connecting as %s: %v", tc.user, err)
			}
			defer nc.Close()

			if err := nc.Publish(tc.subject, []byte("probe")); err != nil {
				t.Fatalf("publishing to %s: %v", tc.subject, err)
			}
			got := permissionsErr(t, nc)
			if tc.wantErr && got == "" {
				t.Fatalf("%s published to %s and was not refused", tc.user, tc.subject)
			}
			if !tc.wantErr && got != "" {
				t.Fatalf("%s publishing to %s was refused: %s", tc.user, tc.subject, got)
			}
		})
	}
}

// The publisher this package builds must connect as its own user, not
// anonymously: with the H7 broker, an anonymous connection cannot publish
// damp.> either, and the failure would look identical to the one above.
func TestNATSAuthNewNATSPublisherUsesCredentials(t *testing.T) {
	if os.Getenv("NATS_TEST_URL") == "" {
		t.Skipf("NATS_TEST_URL is not set")
	}
	url := os.Getenv("NATS_TEST_URL")
	password := testPassword(t, "NATS_TEST_CORE_LEDGER_PASSWORD", "dev-core-ledger-password")

	p, err := NewNATSPublisher(t.Context(), url, "DAMP", "core-ledger", password)
	if err != nil {
		t.Fatalf("NewNATSPublisher with the right credentials: %v", err)
	}
	defer p.Close()

	if err := p.Publish(t.Context(), Event{
		ID:            -1,
		EventType:     "damp.test.nats_auth_probe.v1",
		AggregateType: "TEST",
		AggregateID:   "nats-auth-test",
		Payload:       `{"probe":true}`,
	}); err != nil {
		t.Fatalf("publishing through the real publisher: %v", err)
	}
}
