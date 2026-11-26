// Package testdb guards the Go integration suites against ever opening a
// non-test database.
//
// The core-ledger saga suites strand in-flight sagas behind on purpose, and a
// real worker pointed at the dev `bridge` database will try to put them on
// chain. Integration tests must therefore only ever run against a database
// whose name ends in `_test` — see the Makefile's TEST_DATABASE_URL and
// infra/postgres/init/02-ledger-test-db.sql.
package testdb

import (
	"net/url"
	"os"
	"strings"
	"testing"
)

// DSN returns the value of envVar, skipping the test when it is unset and
// failing the test — not skipping — when it names a database that does not end
// in `_test`. The guard runs before any connection is opened or migration run,
// so a misconfigured suite fails fast instead of writing test fixtures into a
// real ledger.
func DSN(t *testing.T, envVar string) string {
	t.Helper()

	dsn := os.Getenv(envVar)
	if dsn == "" {
		t.Skipf("%s is not set", envVar)
	}

	// The DSNs in this codebase are postgres:// URLs; net/url parses them so
	// the database name is the path. A keyword/value DSN parses without error
	// but its whole body lands in the path, which then cannot end in `_test`,
	// so it fails the same guard rather than slipping through.
	u, err := url.Parse(dsn)
	if err != nil {
		t.Fatalf("%s is not a parseable URL %q: %v", envVar, dsn, err)
	}
	name := strings.TrimPrefix(u.Path, "/")
	if !strings.HasSuffix(name, "_test") {
		t.Fatalf("%s points at database %q, which does not end in _test — refusing to run tests against a non-test database", envVar, name)
	}
	return dsn
}
