#!/usr/bin/env bash
#
# keycloak-sync.sh — idempotently upsert H2's service-to-service auth
# surface into a RUNNING Keycloak.
#
# A fresh realm gets everything from infra/keycloak/realms/damp-realm.json at
# --import-realm time; an existing dev volume does not (Keycloak skips the
# import when the realm already exists). This script makes the two paths
# converge: it upserts the `core-ledger` resource client and its roles, the
# svc-* confidential clients (secret, service account, audience mapper), the
# identity-service client's audience mapper, the core-ledger scope mappings,
# and each service-account user's client roles. Safe to re-run: every step
# is a get-then-create or a full-replace with the same desired state.
#
# It talks to the running usdx-keycloak container through kcadm.sh with the
# bootstrap admin credentials docker-compose.yaml starts it with (admin/admin,
# dev-only). Never real credentials — a real environment provisions its own
# realm and injects real secrets through a secrets manager.
#
# Bash 3.2 compatible (no associative arrays, no ${var,,}); the local stack
# launcher (scripts/stack.sh) calls it after Keycloak reports healthy.
#
# Usage:
#   scripts/keycloak-sync.sh        wait for Keycloak, then upsert (max ~90s)

set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
REPO_ROOT=$(cd -- "$SCRIPT_DIR/.." && pwd -P)

# The compose environment docker-compose.yaml starts the container with.
# Dev-only bootstrap credentials; the script never leaves this machine.
KEYCLOAK_CONTAINER=${KEYCLOAK_CONTAINER:-usdx-keycloak}
KEYCLOAK_ADMIN_USER=${KEYCLOAK_ADMIN_USER:-admin}
KEYCLOAK_ADMIN_PASSWORD=${KEYCLOAK_ADMIN_PASSWORD:-admin}
REALM=${KEYCLOAK_REALM:-damp}
KEYCLOAK_BASE_URL=${KEYCLOAK_BASE_URL:-http://localhost:8080}

CORE_LEDGER_CLIENT="core-ledger"

# kcadm() — one kcadm.sh invocation inside the Keycloak container.
kcadm() {
	docker exec "$KEYCLOAK_CONTAINER" /opt/keycloak/bin/kcadm.sh "$@"
}

# wait_for_keycloak — poll the realm's well-known endpoint (a fresh realm
# only serves it once --import-realm has finished), then prime kcadm's
# credentials against master.
wait_for_keycloak() {
	local i=0
	while [ "$i" -lt 90 ]; do
		if curl -sf "$KEYCLOAK_BASE_URL/realms/$REALM/.well-known/openid-configuration" >/dev/null 2>&1; then
			kcadm config credentials \
				--server "http://localhost:8080" \
				--realm master \
				--user "$KEYCLOAK_ADMIN_USER" \
				--password "$KEYCLOAK_ADMIN_PASSWORD" >/dev/null
			return 0
		fi
		sleep 1
		i=$((i + 1))
	done
	echo "error: keycloak at $KEYCLOAK_BASE_URL did not serve realm $REALM within 90s" >&2
	return 1
}

# client_uuid CLIENT_ID — prints the client's uuid, or nothing when absent.
client_uuid() {
	kcadm get clients -r "$REALM" -q clientId="$1" --fields id --format csv --noquotes 2>/dev/null | tail -n 1
}

# upsert_client CLIENT_ID JSON_BODY — create the client, or replace it with
# the same desired representation when it already exists. The body is the
# full ClientRepresentation, so a re-run writes the same state either way.
upsert_client() {
	local client_id=$1 body=$2 uuid
	uuid=$(client_uuid "$client_id")
	if [ -n "$uuid" ]; then
		kcadm update "clients/$uuid" -r "$REALM" -b "$body" >/dev/null
		echo "keycloak-sync: updated client $client_id"
	else
		kcadm create clients -r "$REALM" -b "$body" >/dev/null
		echo "keycloak-sync: created client $client_id"
	fi
}

# upsert_client_role CLIENT_ID ROLE DESCRIPTION — create the client role
# when absent; an existing role is left exactly as it is.
upsert_client_role() {
	local client_id=$1 role=$2 description=$3 uuid
	uuid=$(client_uuid "$client_id")
	if kcadm get "clients/$uuid/roles/$role" -r "$REALM" >/dev/null 2>&1; then
		return 0
	fi
	kcadm create "clients/$uuid/roles" -r "$REALM" \
		-b "{\"name\": \"$role\", \"description\": \"$description\", \"composite\": false, \"clientRole\": true}" >/dev/null
	echo "keycloak-sync: created role $client_id:$role"
}

# grant_scope_mapping RESOURCE_CLIENT TARGET_CLIENT ROLE — grant TARGET_CLIENT's
# service account permission to include RESOURCE_CLIENT's ROLE in its own
# tokens (the clientScopeMappings block of the realm import). PUT replaces the
# pair's whole mapping, which is exactly the desired list of one role, so a
# re-run converges rather than duplicates.
grant_scope_mapping() {
	local resource=$1 target=$2 role=$3 resource_uuid target_uuid role_rep
	resource_uuid=$(client_uuid "$resource")
	target_uuid=$(client_uuid "$target")
	role_rep=$(kcadm get "clients/$resource_uuid/roles/$role" -r "$REALM" --fields id,name,clientRole,containerId 2>/dev/null)
	# The mapping lives on the client that requests the token (target) and
	# names roles of the resource client. Keycloak only accepts POST here,
	# and adding a mapping that already exists is a no-op.
	kcadm create "clients/$target_uuid/scope-mappings/clients/$resource_uuid" -r "$REALM" -b "[$role_rep]" >/dev/null
	echo "keycloak-sync: granted $target -> $resource:$role"
}

# grant_service_account_role CLIENT_ID ROLE — add the role to the client's
# service-account user (users[].clientRoles in the realm import). add-roles
# is idempotent.
grant_service_account_role() {
	local client_id=$1 role=$2
	kcadm add-roles -r "$REALM" \
		--uusername "service-account-$client_id" \
		--cclientid "$CORE_LEDGER_CLIENT" \
		--rolename "$role" >/dev/null
	echo "keycloak-sync: service-account-$client_id holds $CORE_LEDGER_CLIENT:$role"
}

# svc_client_body CLIENT_ID SECRET — the full desired ClientRepresentation
# every svc-* client (and identity-service) shares: confidential,
# client-credentials only, service account enabled, full scope off, dev
# secret, and the audience mapper that puts core-ledger in the token's aud.
svc_client_body() {
	cat <<EOF
{"clientId": "$1", "name": "$1 (confidential)", "enabled": true, "publicClient": false, "standardFlowEnabled": false, "directAccessGrantsEnabled": false, "serviceAccountsEnabled": true, "fullScopeAllowed": false, "secret": "$2", "protocolMappers": [{"name": "aud-mapper-core-ledger", "protocol": "openid-connect", "protocolMapper": "oidc-audience-mapper", "consentRequired": false, "config": {"included.client.audience": "core-ledger", "id.token.claim": "false", "access.token.claim": "true"}}]}
EOF
}

# identity_service_body — like svc_client_body but WITHOUT a secret: the
# realm import seeds identity-service's dev placeholder, and a real
# environment injects its own — the sync must never overwrite either with a
# dev literal. (On a realm where the client is somehow missing entirely, the
# create below uses the import's placeholder secret.)
identity_service_body() {
	cat <<'EOF'
{"clientId": "identity-service", "name": "services/identity (confidential)", "enabled": true, "publicClient": false, "standardFlowEnabled": false, "directAccessGrantsEnabled": false, "serviceAccountsEnabled": true, "fullScopeAllowed": false, "protocolMappers": [{"name": "aud-mapper-core-ledger", "protocol": "openid-connect", "protocolMapper": "oidc-audience-mapper", "consentRequired": false, "config": {"included.client.audience": "core-ledger", "id.token.claim": "false", "access.token.claim": "true"}}]}
EOF
}

# upsert_all — the whole desired state, in dependency order.
upsert_all() {
	# The resource client everything else references.
	upsert_client "$CORE_LEDGER_CLIENT" \
		"{\"clientId\": \"core-ledger\", \"name\": \"core-ledger API (resource)\", \"enabled\": true, \"publicClient\": false, \"bearerOnly\": true, \"standardFlowEnabled\": false, \"directAccessGrantsEnabled\": false, \"serviceAccountsEnabled\": false}"

	upsert_client_role "$CORE_LEDGER_CLIENT" "ledger.user-proxy" "services/bff: full user-facing + operator surface"
	upsert_client_role "$CORE_LEDGER_CLIENT" "ledger.settlement" "services/payments: POST /wallets, /deposits, /withdrawals, /transfers"
	upsert_client_role "$CORE_LEDGER_CLIENT" "ledger.wallet-provision" "services/identity: POST /wallets"
	upsert_client_role "$CORE_LEDGER_CLIENT" "ledger.wallet-status" "services/kyc + services/compliance: wallet list + status"
	upsert_client_role "$CORE_LEDGER_CLIENT" "ledger.reserves.custodian" "services/rms: custodian snapshots + reserve status"
	upsert_client_role "$CORE_LEDGER_CLIENT" "ledger.reserves.chain-supply" "services/indexer: chain supply snapshots"
	upsert_client_role "$CORE_LEDGER_CLIENT" "ledger.reports.read" "services/reporting: report GET surface"

	# The confidential service clients. identity-service is special-cased to
	# preserve whatever secret the environment injected.
	upsert_client "svc-bff" "$(svc_client_body svc-bff dev-svc-bff-secret)"
	upsert_client "svc-payments" "$(svc_client_body svc-payments dev-svc-payments-secret)"
	upsert_client "svc-kyc" "$(svc_client_body svc-kyc dev-svc-kyc-secret)"
	upsert_client "svc-compliance" "$(svc_client_body svc-compliance dev-svc-compliance-secret)"
	upsert_client "svc-rms" "$(svc_client_body svc-rms dev-svc-rms-secret)"
	upsert_client "svc-reporting" "$(svc_client_body svc-reporting dev-svc-reporting-secret)"
	upsert_client "svc-indexer" "$(svc_client_body svc-indexer dev-svc-indexer-secret)"
	if [ -n "$(client_uuid identity-service)" ]; then
		upsert_client "identity-service" "$(identity_service_body)"
	else
		upsert_client "identity-service" \
			"{\"clientId\": \"identity-service\", \"name\": \"services/identity (confidential)\", \"enabled\": true, \"publicClient\": false, \"standardFlowEnabled\": false, \"directAccessGrantsEnabled\": false, \"serviceAccountsEnabled\": true, \"fullScopeAllowed\": false, \"secret\": \"__CHANGE_ME_IN_A_REAL_ENVIRONMENT__\", \"protocolMappers\": [{\"name\": \"aud-mapper-core-ledger\", \"protocol\": \"openid-connect\", \"protocolMapper\": \"oidc-audience-mapper\", \"consentRequired\": false, \"config\": {\"included.client.audience\": \"core-ledger\", \"id.token.claim\": \"false\", \"access.token.claim\": \"true\"}}]}"
	fi

	# fullScopeAllowed:false means the service account holding a role is not
	# enough for the role to appear in its token — the client must also be
	# granted the role on core-ledger's scope mappings.
	grant_scope_mapping "$CORE_LEDGER_CLIENT" "svc-bff" "ledger.user-proxy"
	grant_scope_mapping "$CORE_LEDGER_CLIENT" "svc-payments" "ledger.settlement"
	grant_scope_mapping "$CORE_LEDGER_CLIENT" "identity-service" "ledger.wallet-provision"
	grant_scope_mapping "$CORE_LEDGER_CLIENT" "svc-kyc" "ledger.wallet-status"
	grant_scope_mapping "$CORE_LEDGER_CLIENT" "svc-compliance" "ledger.wallet-status"
	grant_scope_mapping "$CORE_LEDGER_CLIENT" "svc-rms" "ledger.reserves.custodian"
	grant_scope_mapping "$CORE_LEDGER_CLIENT" "svc-reporting" "ledger.reports.read"
	grant_scope_mapping "$CORE_LEDGER_CLIENT" "svc-indexer" "ledger.reserves.chain-supply"

	# And the roles onto each service-account user itself.
	grant_service_account_role "svc-bff" "ledger.user-proxy"
	grant_service_account_role "svc-payments" "ledger.settlement"
	grant_service_account_role "identity-service" "ledger.wallet-provision"
	grant_service_account_role "svc-kyc" "ledger.wallet-status"
	grant_service_account_role "svc-compliance" "ledger.wallet-status"
	grant_service_account_role "svc-rms" "ledger.reserves.custodian"
	grant_service_account_role "svc-reporting" "ledger.reports.read"
	grant_service_account_role "svc-indexer" "ledger.reserves.chain-supply"

	echo "keycloak-sync: done"
}

if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$KEYCLOAK_CONTAINER"; then
	echo "error: container $KEYCLOAK_CONTAINER is not running (start it with scripts/stack.sh up or docker compose up -d keycloak)" >&2
	exit 1
fi

wait_for_keycloak
upsert_all
