.PHONY: up down logs \
	test test-unit test-integration test-eth test-sol \
	build run \
	lint fmt fmt-check \
	clean

# macOS ships GNU Make 3.81, which predates .SHELLFLAGS (added in 3.82) — it
# would be silently ignored, so any recipe that pipes (test-integration)
# sets `pipefail` itself instead of relying on it globally.
SHELL := /bin/bash

DATABASE_URL ?= postgres://bridge:bridge@localhost:55433/bridge?sslmode=disable

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
	go vet ./core-ledger/...
	go test ./core-ledger/... -count=1 -race

## Go integration tests against real Postgres. Fails (not skips) if
## DATABASE_URL / the compose stack isn't reachable, or if a test that
## should run against it got silently skipped.
test-integration: up
	@set -euo pipefail; \
	LEDGER_TEST_DATABASE_URL="$(DATABASE_URL)" \
		go test ./core-ledger/... -count=1 -race -v 2>&1 | tee /tmp/usdx-go-test.log; \
	if grep -q '^--- SKIP: TestIntegration' /tmp/usdx-go-test.log; then \
		echo "an integration test was skipped — LEDGER_TEST_DATABASE_URL must be set and reachable"; \
		exit 1; \
	fi

## Foundry suite. Requires `forge install` to have pulled chains/ethereum/lib
## at least once (see chains/ethereum/README.md).
test-eth:
	cd chains/ethereum && forge test

## Anchor/litesvm suite. Requires anchor build --arch v1 --ignore-keys first
## (see chains/solana/README.md#testing) — plain `anchor build`/`anchor test`
## defaults to an SBF arch litesvm 0.10.0 can't verify.
test-sol:
	cd chains/solana && anchor build --arch v1 --ignore-keys && cargo test -p usdx_bridge

# ---------------------------------------------------------------------------
# Build / run
# ---------------------------------------------------------------------------

## Build the core-ledger binary.
build:
	go build -o bin/core-ledger ./core-ledger/cmd/server

## Run core-ledger against local infra (needs core-ledger/.env — see .env.example).
run: up
	cd core-ledger && go run ./cmd/server

# ---------------------------------------------------------------------------
# Formatting / linting
# ---------------------------------------------------------------------------

## Format everything in place.
fmt:
	go fmt ./core-ledger/...
	cd chains/ethereum && forge fmt
	cd chains/solana && cargo fmt -p usdx_bridge

## Check formatting without changing anything (what CI runs).
fmt-check:
	cd chains/ethereum && forge fmt --check
	cd chains/solana && cargo fmt -p usdx_bridge -- --check

lint: fmt-check
	go vet ./core-ledger/...
	cd chains/solana && cargo clippy -p usdx_bridge --tests -- -D warnings

# ---------------------------------------------------------------------------
clean:
	rm -rf bin/
	docker compose down -v
