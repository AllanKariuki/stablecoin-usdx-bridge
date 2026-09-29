.PHONY: help up down logs up-app kill-worker logs-worker up-obs down-obs \
	test test-unit test-integration test-eth test-sol test-node \
	build run run-worker run-indexer reconcile docker-build \
	lint fmt fmt-check \
	authz-gen keycloak-realm \
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

## Start the observability stack (Prometheus, Pushgateway, Grafana, Loki).
# Behind its own profile so a plain `make up` stays a database and a broker
# rather than a nine-container stack. Grafana is on 53000, not 3000 — 3000
# belongs to services/notifications' WebSocket, which the frontend's
# runtime-config.js hardcodes.
up-obs:
	docker compose --profile obs up -d
	@echo "grafana on http://localhost:53000 (anonymous viewer), prometheus on :59090"
	@echo "mailpit on http://localhost:58025 — every email notifications sends lands here"

## Stop the observability stack.
down-obs:
	docker compose --profile obs down

# ---------------------------------------------------------------------------
# Tests — this is the one command CI and a fresh clone should both run.
# A skipped integration test is treated as a failure: see test-integration.
# ---------------------------------------------------------------------------

## Run every test suite: Go (unit + integration), Foundry, Anchor/litesvm, Node.
test: test-unit test-integration test-eth test-sol test-node

## Go unit tests only — no Postgres required.
test-unit:
	go vet ./core-ledger/... ./shared/go/platform/... ./shared/authz/... ./services/auth-proxy/... ./services/indexer/...
	go test ./core-ledger/... ./shared/go/platform/... ./shared/authz/... ./services/auth-proxy/... ./services/indexer/... -count=1 -race

## Go integration tests against real Postgres — fails (not skips) if unreachable.
# Also fails if a test that should run against Postgres got silently
# skipped instead (see the grep below), not just on a hard test failure.
test-integration: up
	@set -euo pipefail; \
	LEDGER_TEST_DATABASE_URL="$(DATABASE_URL)" \
		go test ./core-ledger/... -count=1 -race -v 2>&1 | tee /tmp/usdx-go-test.log; \
	if grep -q '^--- SKIP:' /tmp/usdx-go-test.log; then \
		echo "a test was skipped — LEDGER_TEST_DATABASE_URL must be set and reachable"; \
		grep '^--- SKIP:' /tmp/usdx-go-test.log; \
		exit 1; \
	fi

## Foundry suite — requires `forge install` once first (see chains/ethereum/README.md).
test-eth:
	cd chains/ethereum && forge test

## Anchor/litesvm suite (builds with --arch v1 first — see chains/solana/README.md#testing).
# Plain `anchor build`/`anchor test` defaults to an SBF arch litesvm can't verify.
test-sol:
	cd chains/solana && anchor build --arch v1 --ignore-keys && cargo test -p usdx_bridge

## Node workspace tests (nest-platform, bff, identity, rms, payments,
## notifications). identity's suite needs real Postgres (see
## services/identity/test/fixtures/bootstrap.ts) — depends on `up` the same
## way test-integration does. --if-present skips frontend, which has no
## test script yet.
test-node: up
	pnpm -r --if-present run test

# ---------------------------------------------------------------------------
# Build / run
# ---------------------------------------------------------------------------

## Build every Go binary.
build:
	go build -o bin/core-ledger ./core-ledger/cmd/server
	go build -o bin/core-ledger-worker ./core-ledger/cmd/worker
	go build -o bin/core-ledger-reconcile ./core-ledger/cmd/reconcile
	go build -o bin/auth-proxy ./services/auth-proxy/cmd/server
	go build -o bin/indexer ./services/indexer/cmd/server

## Run core-ledger against local infra (needs core-ledger/.env — see .env.example).
run: up
	cd core-ledger && go run ./cmd/server

## Run the saga worker against local infra. The API only enqueues sagas now,
## so nothing reaches a chain until this is running.
run-worker: up
	cd core-ledger && go run ./cmd/worker

## Run the chain indexer against local infra (needs services/indexer/.env).
# Nothing writes eth/sol_supply_snapshot without this, so reconciliation's
# Leg A falls back to calling the chains directly.
run-indexer: up
	cd services/indexer && go run ./cmd/server

## Reconcile once and report. Exit 0 balanced, 2 broken, 1 could-not-check.
# This is the same binary the k8s CronJob runs; `--watch 5m` is the long-lived
# form compose uses.
reconcile:
	cd core-ledger && go run ./cmd/reconcile --triggered-by operator

## Build every service image.
docker-build:
	docker build -f core-ledger/Dockerfile -t usdx/core-ledger:dev .
	docker build -f services/indexer/Dockerfile -t usdx/indexer:dev .
	docker build -f services/payments/Dockerfile -t usdx/payments:dev .
	docker build -f services/notifications/Dockerfile -t usdx/notifications:dev .
	docker build -f services/workflow/Dockerfile -t usdx/workflow:dev .
	docker build -f services/kyc/Dockerfile -t usdx/kyc:dev .
	docker build -f services/compliance/Dockerfile -t usdx/compliance:dev .

## Bring up infra *and* the containerised API and worker.
# This is what P2's definition of done needs: a worker you can `docker kill`
# mid-flight (see kill-worker) and watch the saga survive.
up-app: docker-build
	docker compose --profile app up -d
	@echo "core-ledger on :8081, saga worker probes on :8181"

## Kill the saga worker without a graceful stop, the way a crash would.
# Compose restarts nothing on its own, so `make up-app` brings it back and the
# boot sweep resumes whatever was in flight.
kill-worker:
	docker kill usdx-worker

## Tail the saga worker's logs.
logs-worker:
	docker compose logs -f worker

# ---------------------------------------------------------------------------
# Formatting / linting
# ---------------------------------------------------------------------------

## Format everything in place.
fmt:
	go fmt ./core-ledger/... ./shared/go/platform/... ./shared/authz/... ./services/auth-proxy/... ./services/indexer/...
	cd chains/ethereum && forge fmt
	cd chains/solana && cargo fmt -p usdx_bridge

## Check formatting without changing anything (what CI runs).
fmt-check:
	cd chains/ethereum && forge fmt --check
	cd chains/solana && cargo fmt -p usdx_bridge -- --check

lint: fmt-check
	go vet ./core-ledger/... ./shared/go/platform/... ./shared/authz/... ./services/auth-proxy/... ./services/indexer/...
	cd chains/solana && cargo clippy -p usdx_bridge --tests -- -D warnings
	pnpm -r --if-present run lint

# ---------------------------------------------------------------------------
# Authorization (RBAC)
# ---------------------------------------------------------------------------

## Regenerate the Go/TS/Keycloak authz artifacts from shared/authz/permissions.yaml.
## Run this and commit the result whenever permissions.yaml changes.
authz-gen:
	go run ./shared/authz/gen

## Compose the importable realm JSON from the template + the generated roles
## fragment. Run after authz-gen (or `make authz-gen keycloak-realm` together)
## whenever permissions.yaml or the template changes.
keycloak-realm: authz-gen
	@jq \
		--slurpfile roles shared/authz/generated/keycloak-roles.json \
		'(walk(if type == "object" then with_entries(select(.key | startswith("_comment") | not)) else . end)) | .roles.realm = $$roles[0]' \
		infra/keycloak/templates/damp-realm.template.json > infra/keycloak/realms/damp-realm.json
	@jq empty infra/keycloak/realms/damp-realm.json && echo "wrote infra/keycloak/realms/damp-realm.json"

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
