.PHONY: help up down logs \
	test test-unit test-integration test-eth test-sol \
	build run \
	lint fmt fmt-check \
	authz-gen \
	hooks-install secrets-scan \
	clean

# macOS ships GNU Make 3.81, which predates .SHELLFLAGS (added in 3.82) — it
# would be silently ignored, so any recipe that pipes (test-integration)
# sets `pipefail` itself instead of relying on it globally.
SHELL := /bin/bash

DATABASE_URL ?= postgres://bridge:bridge@localhost:55433/bridge?sslmode=disable

.DEFAULT_GOAL := help

## Show this list — every target with a `##` comment directly above it.
# Plain `#` continuation lines between the `##` summary and the target
# (extra detail not meant for this listing) don't break the association;
# only a blank line or another target does.
help:
	@awk '/^## / { desc = $$0; next } \
	      /^#/ { next } \
	      /^[a-zA-Z_-]+:/ && desc != "" { \
	          split($$0, parts, ":"); \
	          gsub(/^## /, "", desc); \
	          printf "  \033[36m%-18s\033[0m %s\n", parts[1], desc; \
	          desc = ""; \
	          next \
	      } \
	      { desc = "" }' $(MAKEFILE_LIST)

# ---------------------------------------------------------------------------
# Local infrastructure
# ---------------------------------------------------------------------------

## Start local infra (Postgres) in the background.
up:
	docker compose up -d
	@echo "waiting for postgres..."
	@until docker inspect --format '{{.State.Health.Status}}' usdx-postgres 2>/dev/null | grep -q healthy; do sleep 1; done
	@echo "postgres is healthy on localhost:55433"

## Stop local infra.
down:
	docker compose down

## Tail infra logs.
logs:
	docker compose logs -f

# ---------------------------------------------------------------------------
# Tests — this is the one command CI and a fresh clone should both run.
# A skipped integration test is treated as a failure: see test-integration.
# ---------------------------------------------------------------------------

## Run every test suite: Go (unit + integration), Foundry, Anchor/litesvm.
test: test-unit test-integration test-eth test-sol

## Go unit tests only — no Postgres required.
test-unit:
	go vet ./core-ledger/... ./shared/go/platform/... ./shared/authz/... ./services/auth-proxy/...
	go test ./core-ledger/... ./shared/go/platform/... ./shared/authz/... ./services/auth-proxy/... -count=1 -race

## Go integration tests against real Postgres — fails (not skips) if unreachable.
# Also fails if a test that should run against Postgres got silently
# skipped instead (see the grep below), not just on a hard test failure.
test-integration: up
	@set -euo pipefail; \
	LEDGER_TEST_DATABASE_URL="$(DATABASE_URL)" \
		go test ./core-ledger/... -count=1 -race -v 2>&1 | tee /tmp/usdx-go-test.log; \
	if grep -q '^--- SKIP: TestIntegration' /tmp/usdx-go-test.log; then \
		echo "an integration test was skipped — LEDGER_TEST_DATABASE_URL must be set and reachable"; \
		exit 1; \
	fi

## Foundry suite — requires `forge install` once first (see chains/ethereum/README.md).
test-eth:
	cd chains/ethereum && forge test

## Anchor/litesvm suite (builds with --arch v1 first — see chains/solana/README.md#testing).
# Plain `anchor build`/`anchor test` defaults to an SBF arch litesvm can't verify.
test-sol:
	cd chains/solana && anchor build --arch v1 --ignore-keys && cargo test -p usdx_bridge

# ---------------------------------------------------------------------------
# Build / run
# ---------------------------------------------------------------------------

## Build the core-ledger and auth-proxy binaries.
build:
	go build -o bin/core-ledger ./core-ledger/cmd/server
	go build -o bin/auth-proxy ./services/auth-proxy/cmd/server

## Run core-ledger against local infra (needs core-ledger/.env — see .env.example).
run: up
	cd core-ledger && go run ./cmd/server

# ---------------------------------------------------------------------------
# Formatting / linting
# ---------------------------------------------------------------------------

## Format everything in place.
fmt:
	go fmt ./core-ledger/... ./shared/go/platform/... ./shared/authz/... ./services/auth-proxy/...
	cd chains/ethereum && forge fmt
	cd chains/solana && cargo fmt -p usdx_bridge

## Check formatting without changing anything (what CI runs).
fmt-check:
	cd chains/ethereum && forge fmt --check
	cd chains/solana && cargo fmt -p usdx_bridge -- --check

lint: fmt-check
	go vet ./core-ledger/... ./shared/go/platform/... ./shared/authz/... ./services/auth-proxy/...
	cd chains/solana && cargo clippy -p usdx_bridge --tests -- -D warnings

# ---------------------------------------------------------------------------
# Authorization (RBAC)
# ---------------------------------------------------------------------------

## Regenerate the Go/TS/Keycloak authz artifacts from shared/authz/permissions.yaml.
## Run this and commit the result whenever permissions.yaml changes.
authz-gen:
	go run ./shared/authz/gen

# ---------------------------------------------------------------------------
# Secrets
# ---------------------------------------------------------------------------

## One-time per clone: installs the pre-commit secret scan.
# Hooks in .git/hooks/ are never tracked by git — this points git at the
# tracked .githooks/ directory instead, so the hook reaches every clone.
hooks-install:
	git config core.hooksPath .githooks
	@echo "pre-commit secret scanning installed (requires: brew install gitleaks)"

## Scan git history for leaked secrets (what the security CI job runs).
secrets-scan:
	gitleaks detect --source . -v

# ---------------------------------------------------------------------------
clean:
	rm -rf bin/
	docker compose down -v
