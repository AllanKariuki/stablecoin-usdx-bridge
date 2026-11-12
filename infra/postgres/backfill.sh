#!/usr/bin/env bash
# Applies every role and database in infra/postgres/init/ to a Postgres whose
# volume predates some of them.
#
# The postgres image runs docker-entrypoint-initdb.d/ only against an EMPTY
# data directory, so a `pgdata` volume created before P4 has no payments or
# notifications role, one created before P7 no audit_trail or reporting — and
# the suites that need them fail on a connection error that says nothing about
# why. The init scripts themselves can't simply be re-run: CREATE ROLE and
# CREATE DATABASE have no IF NOT EXISTS, so the first statement that already
# holds aborts the script and everything after it in that file is skipped.
#
# So each statement is run on its own, only if what it creates is missing.
# The init scripts are read rather than restated here, which keeps a new
# 07-p8-databases.sql covered without touching this file — and anything in
# them other than CREATE ROLE / CREATE DATABASE is a hard error, because
# silently skipping a GRANT or an extension is the bug this exists to remove.
#
# Usage: infra/postgres/backfill.sh [container]   (default: usdx-postgres)
set -euo pipefail

container="${1:-usdx-postgres}"
init_dir="$(cd "$(dirname "$0")/init" && pwd)"

# No `-i`: this runs inside a `while read` loop, and an interactive docker
# exec would swallow the rest of the loop's stdin.
psql() { docker exec "$container" psql -U bridge -d postgres -v ON_ERROR_STOP=1 -qtA "$@"; }

for f in "$init_dir"/*.sql; do
	# Statements only: strip comments and blank lines.
	stmts=$(sed -e 's/--.*$//' -e '/^[[:space:]]*$/d' "$f")
	if other=$(grep -Ev '^CREATE (ROLE|DATABASE) [a-z_]+ .*;$' <<<"$stmts"); then
		echo "$f: backfill.sh only understands one-line CREATE ROLE / CREATE DATABASE statements; teach it this:" >&2
		echo "$other" >&2
		exit 1
	fi

	while IFS= read -r stmt; do
		read -r _ kind name _ <<<"$stmt"
		case "$kind" in
			ROLE) exists="SELECT 1 FROM pg_roles WHERE rolname = '$name'" ;;
			DATABASE) exists="SELECT 1 FROM pg_database WHERE datname = '$name'" ;;
		esac
		if [ -z "$(psql -c "$exists")" ]; then
			echo "backfill: $(basename "$f"): CREATE $kind $name"
			psql -c "$stmt" >/dev/null
		fi
	done <<<"$stmts"
done
