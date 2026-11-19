#!/usr/bin/env bash
#
# stack.sh — one-shot launcher for the local usdx-bridge development stack.
#
# It *starts* things; it never builds images. Infrastructure containers come
# from docker compose; every application service runs from source on the host.
# If the core-ledger image is missing, core-ledger and worker are skipped and
# the script says so — build them once with `make docker-build`.
#
# Usage:
#   scripts/stack.sh up             start infra containers + every host service
#   scripts/stack.sh down           stop the host services (containers keep running)
#   scripts/stack.sh down --infra   ...and stop the containers too (volumes kept)
#   scripts/stack.sh status         show what is running, where, and on which port
#
# Logs and pid files live in .logs/stack/ (gitignored). Host ports 8081/8181
# are often taken by other projects, so core-ledger and the worker publish on
# 18081/18181 by default.
#
# Everything below can be overridden from the environment:
#   CORE_LEDGER_HOST_PORT            (18081)
#   WORKER_HOST_PORT                 (18181)
#   SOLANA_RELAYER_KEYPAIR_HOST_PATH ($HOME/.config/solana/usdx-relayer.json)
#   AUDIT_TRAIL_TOKEN                (dev-audit-ingest-token)
#   WORKFLOW_CALLBACK_SECRET         (dev-workflow-callback-secret)
#   WORKER_AUDIT_TRAIL_URL           (http://host.docker.internal:8085)

set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
REPO_ROOT=$(cd -- "$SCRIPT_DIR/.." && pwd -P)
RUNTIME_DIR="$REPO_ROOT/.logs/stack"

CORE_LEDGER_HOST_PORT=${CORE_LEDGER_HOST_PORT:-18081}
WORKER_HOST_PORT=${WORKER_HOST_PORT:-18181}
SOLANA_RELAYER_KEYPAIR_HOST_PATH=${SOLANA_RELAYER_KEYPAIR_HOST_PATH:-${HOME:-}/.config/solana/usdx-relayer.json}
AUDIT_TRAIL_TOKEN=${AUDIT_TRAIL_TOKEN:-dev-audit-ingest-token}
WORKFLOW_CALLBACK_SECRET=${WORKFLOW_CALLBACK_SECRET:-dev-workflow-callback-secret}
WORKER_AUDIT_TRAIL_URL=${WORKER_AUDIT_TRAIL_URL:-http://host.docker.internal:8085}

# Compose reads these from the environment for its ports, volumes and worker
# settings.
export CORE_LEDGER_HOST_PORT WORKER_HOST_PORT SOLANA_RELAYER_KEYPAIR_HOST_PATH WORKER_AUDIT_TRAIL_URL

CORE_LEDGER_URL="http://localhost:$CORE_LEDGER_HOST_PORT"
AUDIT_TRAIL_URL="http://localhost:8085"

# name:kind:port — the host-run services, in start order. kind picks the
# command: go services run from their own directory, node services use pnpm.
SERVICE_TABLE="audit-trail:go:8085
signer:go:8084
indexer:go:8083
identity:node:3001
workflow:node:3006
notifications:node:3000
payments:node:3003
kyc:node:3007
compliance:node:3004
reporting:node:3008
rms:node:3005
bff:node:3002
auth-proxy:go:8090"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

compose() {
	(cd "$REPO_ROOT" && docker compose "$@")
}

read_pid() {
	# Prints the pid in $1 (a pid file), or nothing if absent/not numeric.
	local pid
	pid=$(cat "$1" 2>/dev/null || true)
	case $pid in
	# 0 is rejected too: `kill -- -0` would signal this script's own group.
	'' | 0 | *[!0-9]*) printf '' ;;
	*) printf '%s' "$pid" ;;
	esac
}

process_alive() {
	case ${1:-} in
	'' | *[!0-9]*) return 1 ;;
	esac
	kill -0 "$1" 2>/dev/null
}

port_listens() {
	lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

port_rows() {
	# name:port for every expected listener, one per line.
	local name kind port
	while IFS=: read -r name kind port; do
		[ -n "$name" ] || continue
		echo "$name:$port"
	done <<EOF
$SERVICE_TABLE
EOF
	echo "frontends:5173"
	echo "frontends:5174"
}

service_names() {
	local name kind port
	while IFS=: read -r name kind port; do
		[ -n "$name" ] || continue
		echo "$name"
	done <<EOF
$SERVICE_TABLE
EOF
}

# service_env NAME — prints the host-side env overrides for a service, one
# KEY=VALUE per line. The same data drives every service; nothing is copied.
service_env() {
	case "$1" in
	audit-trail)
		echo "INGEST_TOKEN=$AUDIT_TRAIL_TOKEN"
		echo "ANCHOR_INTERVAL=5m"
		;;
	signer)
		echo "SOLANA_RELAYER_KEYPAIR_PATH=$SOLANA_RELAYER_KEYPAIR_HOST_PATH"
		echo "AUDIT_TRAIL_URL=$AUDIT_TRAIL_URL"
		echo "AUDIT_TRAIL_TOKEN=$AUDIT_TRAIL_TOKEN"
		;;
	indexer)
		echo "CORE_LEDGER_URL=$CORE_LEDGER_URL"
		;;
	identity)
		echo "PORT=3001"
		echo "CORE_LEDGER_URL=$CORE_LEDGER_URL"
		echo "AUDIT_TRAIL_URL=$AUDIT_TRAIL_URL"
		echo "AUDIT_TRAIL_TOKEN=$AUDIT_TRAIL_TOKEN"
		;;
	workflow)
		echo "CALLBACK_SECRET=$WORKFLOW_CALLBACK_SECRET"
		echo "AUDIT_TRAIL_URL=$AUDIT_TRAIL_URL"
		echo "AUDIT_TRAIL_TOKEN=$AUDIT_TRAIL_TOKEN"
		;;
	notifications)
		echo "NATS_URL=nats://localhost:54222"
		echo "IDENTITY_SERVICE_URL=http://localhost:3001"
		;;
	payments)
		echo "CORE_LEDGER_URL=$CORE_LEDGER_URL"
		echo "NOTIFICATIONS_URL=http://localhost:3000"
		echo "AUDIT_TRAIL_URL=$AUDIT_TRAIL_URL"
		echo "AUDIT_TRAIL_TOKEN=$AUDIT_TRAIL_TOKEN"
		;;
	kyc)
		echo "CORE_LEDGER_URL=$CORE_LEDGER_URL"
		echo "WORKFLOW_URL=http://localhost:3006"
		echo "WORKFLOW_CALLBACK_SECRET=$WORKFLOW_CALLBACK_SECRET"
		echo "AUDIT_TRAIL_URL=$AUDIT_TRAIL_URL"
		echo "AUDIT_TRAIL_TOKEN=$AUDIT_TRAIL_TOKEN"
		;;
	compliance)
		echo "CORE_LEDGER_URL=$CORE_LEDGER_URL"
		echo "WORKFLOW_URL=http://localhost:3006"
		echo "WORKFLOW_CALLBACK_SECRET=$WORKFLOW_CALLBACK_SECRET"
		echo "NOTIFICATIONS_URL=http://localhost:3000"
		echo "AUDIT_TRAIL_URL=$AUDIT_TRAIL_URL"
		echo "AUDIT_TRAIL_TOKEN=$AUDIT_TRAIL_TOKEN"
		;;
	reporting)
		echo "CORE_LEDGER_URL=$CORE_LEDGER_URL"
		echo "AUDIT_TRAIL_URL=$AUDIT_TRAIL_URL"
		echo "AUDIT_TRAIL_TOKEN=$AUDIT_TRAIL_TOKEN"
		;;
	rms)
		echo "CORE_LEDGER_URL=$CORE_LEDGER_URL"
		echo "AUDIT_TRAIL_URL=$AUDIT_TRAIL_URL"
		echo "AUDIT_TRAIL_TOKEN=$AUDIT_TRAIL_TOKEN"
		;;
	bff)
		echo "PORT=3002"
		echo "CORE_LEDGER_URL=$CORE_LEDGER_URL"
		echo "PAYMENTS_URL=http://localhost:3003"
		echo "NOTIFICATIONS_URL=http://localhost:3000"
		echo "WORKFLOW_URL=http://localhost:3006"
		echo "KYC_URL=http://localhost:3007"
		echo "COMPLIANCE_URL=http://localhost:3004"
		echo "REPORTING_URL=http://localhost:3008"
		echo "AUDIT_TRAIL_URL=$AUDIT_TRAIL_URL"
		echo "RMS_URL=http://localhost:3005"
		;;
	auth-proxy)
		echo "IDENTITY_SERVICE_URL=http://localhost:3001"
		;;
	esac
}

# start_process NAME DIR CMD KIND [KEY=VALUE ...]
#
# Runs CMD from DIR in its own process group, with the KEY=VALUE overrides
# exported into its environment. KIND is "go" or "node": only Go services have
# their DIR/.env sourced into the environment (they don't read it themselves).
# Node services do their own dotenv loading via ConfigModule, and their .env
# files are dotenv, not shell — `SMTP_FROM=DAMP <no-reply@damp.local>` is a
# redirect to bash — so sourcing them here would break them. Either way the
# overrides applied after .env win: Go sees them last, Nest's dotenv never
# overwrites an existing process variable.
start_process() {
	local name=$1 dir=$2 cmd=$3 kind=$4
	shift 4
	local log="$RUNTIME_DIR/$name.log"
	local pidfile="$RUNTIME_DIR/$name.pid"
	local pid pair inner

	pid=$(read_pid "$pidfile")
	if [ -n "$pid" ] && process_alive "$pid"; then
		echo "$name: already running (pid $pid)"
		return 0
	fi

	inner="cd '$dir' || exit 1"
	if [ "$kind" = "go" ] && [ -f "$dir/.env" ]; then
		inner="$inner
set -a
. ./.env || exit 1
set +a"
	fi
	for pair in "$@"; do
		inner="$inner
export '$pair'"
	done
	inner="$inner
exec $cmd"

	: >"$log"
	nohup bash -c "$inner" >"$log" 2>&1 </dev/null &
	pid=$!
	echo "$pid" >"$pidfile"
	echo "$name: started (pid $pid, log $log)"
}

# ---------------------------------------------------------------------------
# up
# ---------------------------------------------------------------------------

start_services() {
	local name kind port dir cmd envpairs
	while IFS=: read -r name kind port; do
		[ -n "$name" ] || continue
		dir="$REPO_ROOT/services/$name"
		if [ ! -f "$dir/.env" ]; then
			echo "warning: $name: no .env in $dir — skipping (copy .env.example)" >&2
			continue
		fi
		if [ "$kind" = "go" ]; then
			cmd="go run ./cmd/server"
		else
			cmd="pnpm run start:dev"
		fi
		envpairs=$(service_env "$name")
		# Word split on purpose: each line is one KEY=VALUE word.
		start_process "$name" "$dir" "$cmd" "$kind" $envpairs
	done <<EOF
$SERVICE_TABLE
EOF
}

start_frontends() {
	# Vite reads its own config; there is no .env to source at the repo root.
	start_process "frontends" "$REPO_ROOT" \
		"pnpm --parallel --filter portal --filter ops-console run dev" "node"
}

wait_for_ports() {
	local deadline=$((SECONDS + 180))
	local rows name port failed pair logpath
	rows=$(port_rows)
	while :; do
		failed=""
		while IFS=: read -r name port; do
			[ -n "$name" ] || continue
			if ! port_listens "$port"; then
				failed="$failed $name:$port"
			fi
		done <<EOF
$rows
EOF
		if [ -z "$failed" ]; then
			return 0
		fi
		if [ "$SECONDS" -ge "$deadline" ]; then
			break
		fi
		sleep 2
	done

	echo "warning: these never started listening (180s):$failed" >&2
	for pair in $failed; do
		name=${pair%%:*}
		port=${pair##*:}
		logpath="$RUNTIME_DIR/$name.log"
		echo "--- $name (port $port) — last 15 lines of $logpath" >&2
		tail -n 15 "$logpath" >&2 || true
	done
	return 1
}

cmd_up() {
	mkdir -p "$RUNTIME_DIR"

	echo "== infra (docker compose, no image build)"
	compose up -d --no-build postgres keycloak redis traefik timescaledb nats minio

	if docker image inspect usdx/core-ledger:dev >/dev/null 2>&1; then
		echo "== core-ledger + worker (image present)"
		compose --profile app up -d --no-build core-ledger worker
	else
		echo "warning: image usdx/core-ledger:dev not found — skipping core-ledger and worker." >&2
		echo "         run 'make docker-build', then re-run 'make stack-up'." >&2
	fi

	# Traefik sometimes comes up without its published host port; recreating
	# just that container restores the 8082 binding without touching anything
	# else.
	if [ -z "$(docker port usdx-traefik 8082 2>/dev/null || true)" ]; then
		echo "== traefik is missing its 8082 host binding — recreating it"
		compose up -d --no-build --force-recreate traefik
	fi

	echo "== waiting for postgres to report healthy (max 90s)"
	local i=0
	while [ "$i" -lt 90 ]; do
		if [ "$(docker inspect --format '{{.State.Health.Status}}' usdx-postgres 2>/dev/null || true)" = "healthy" ]; then
			break
		fi
		sleep 1
		i=$((i + 1))
	done
	if [ "$i" -ge 90 ]; then
		echo "warning: usdx-postgres did not report healthy within 90s — continuing anyway" >&2
	fi

	echo "== host services"
	# Job control: each background launch gets its own process group, so
	# `down` can signal a service together with the children it spawns
	# (ts-node, vite, and the binary `go run` builds).
	set -m
	start_services
	start_frontends
	set +m

	echo "== waiting for host services to listen (max 180s)"
	local rc=0
	if ! wait_for_ports; then
		rc=1
	fi

	echo
	print_status
	return $rc
}

# ---------------------------------------------------------------------------
# down
# ---------------------------------------------------------------------------

stop_process() {
	local name=$1
	local pidfile="$RUNTIME_DIR/$name.pid"
	local pid i
	pid=$(read_pid "$pidfile")
	if [ -z "$pid" ]; then
		rm -f "$pidfile"
		return 0
	fi

	# Signal the whole group so the children a service spawned (ts-node,
	# vite, the binary `go run` built) go with it. If no such group exists —
	# e.g. job control was unavailable — fall back to the pid itself.
	if ! kill -TERM -- "-$pid" 2>/dev/null; then
		kill -TERM "$pid" 2>/dev/null || true
	fi
	i=0
	while [ "$i" -lt 10 ]; do
		if ! process_alive "$pid"; then
			break
		fi
		sleep 1
		i=$((i + 1))
	done
	if process_alive "$pid"; then
		if ! kill -KILL -- "-$pid" 2>/dev/null; then
			kill -KILL "$pid" 2>/dev/null || true
		fi
	fi
	rm -f "$pidfile"
	echo "$name: stopped"
}

cmd_down() {
	local stop_infra=$1 name rows leftover pair

	for name in $(service_names) frontends; do
		stop_process "$name"
	done

	# Anything still bound is something this script did not start; report it
	# rather than killing a process whose owner we don't know.
	leftover=""
	rows=$(port_rows)
	while IFS=: read -r name port; do
		[ -n "$name" ] || continue
		if port_listens "$port"; then
			leftover="$leftover $name:$port"
		fi
	done <<EOF
$rows
EOF
	if [ -n "$leftover" ]; then
		echo "note: still listening (not started by this script, left alone):$leftover" >&2
	fi

	if [ "$stop_infra" -eq 1 ]; then
		echo "== stopping infra containers (volumes and containers kept)"
		compose --profile app stop
	fi
}

# ---------------------------------------------------------------------------
# status
# ---------------------------------------------------------------------------

print_status() {
	local name kind port pid pidfile state

	printf '%-14s %-10s %-6s %-8s %s\n' "NAME" "PORT" "STATE" "PID" "LOG"
	while IFS=: read -r name kind port; do
		[ -n "$name" ] || continue
		pidfile="$RUNTIME_DIR/$name.pid"
		pid=$(read_pid "$pidfile")
		if [ -n "$pid" ] && ! process_alive "$pid"; then
			pid=""
		fi
		state="down"
		if port_listens "$port"; then
			state="up"
		fi
		printf '%-14s %-10s %-6s %-8s %s\n' \
			"$name" "$port" "$state" "${pid:--}" "$RUNTIME_DIR/$name.log"
	done <<EOF
$SERVICE_TABLE
EOF

	pid=$(read_pid "$RUNTIME_DIR/frontends.pid")
	if [ -n "$pid" ] && ! process_alive "$pid"; then
		pid=""
	fi
	state="down"
	if port_listens 5173 && port_listens 5174; then
		state="up"
	fi
	printf '%-14s %-10s %-6s %-8s %s\n' \
		"frontends" "5173/5174" "$state" "${pid:--}" "$RUNTIME_DIR/frontends.log"

	echo
	echo "containers:"
	docker ps --filter name=usdx --format 'table {{.Names}}\t{{.Status}}' || true

	echo
	echo "portal:      http://localhost:5173"
	echo "ops console: http://localhost:5174"
	echo "gateway:     http://localhost:8082/api"
	echo "keycloak:    http://localhost:8080"
}

# ---------------------------------------------------------------------------

usage() {
	cat <<EOF
usage: $(basename "$0") <command>

commands:
  up              start infra containers and every host service (never builds images)
  down [--infra]  stop the host services; --infra also stops the containers
                  (volumes and containers are kept)
  status          show host services, ports, container state and the local URLs

logs and pid files: $RUNTIME_DIR
EOF
}

case "${1:-}" in
up)
	cmd_up
	;;
down)
	shift
	if [ "${1:-}" = "--infra" ]; then
		cmd_down 1
	elif [ $# -gt 0 ]; then
		usage >&2
		exit 2
	else
		cmd_down 0
	fi
	;;
status)
	print_status
	;;
*)
	usage
	exit 2
	;;
esac
