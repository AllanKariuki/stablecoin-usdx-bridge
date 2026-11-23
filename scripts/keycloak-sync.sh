#!/usr/bin/env bash
#
# keycloak-sync.sh — idempotently upsert the service-to-service auth surface
# into a RUNNING Keycloak.
#
# A fresh realm gets everything from infra/keycloak/realms/damp-realm.json at
# --import-realm time; an existing dev volume does not (Keycloak skips the
# import when the realm already exists). This script makes the two paths
# converge: it upserts the bearer-only resource clients and their roles, the
# svc-* confidential clients (secret, service account, audience mappers), the
# identity-service client's audience mappers, the scope mappings that let each
# role appear in the requesting client's tokens, and each service-account
# user's client roles. Safe to re-run: every step is a get-then-create or a
# full-replace with the same desired state.
#
# Since H3 the whole surface is DATA, not code: the five lists below
# (RESOURCE_CLIENTS, CLIENT_ROLES, SVC_CLIENTS, AUDIENCE_MAPPERS, SCOPE_GRANTS)
# mirror infra/keycloak/templates/damp-realm.template.json, and adding a
# receiver or a caller is a list entry, not a new helper. Keep the lists in
# the same order as the template so a diff between the two is readable.
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

# ---------------------------------------------------------------------------
# The desired state. Entry format is tilde-separated fields (descriptions
# contain spaces and colons, so a printable separator beats quoting); a line
# that is empty or starts with # is ignored. Mirrors damp-realm.template.json.
# ---------------------------------------------------------------------------

# RESOURCE_CLIENTS: "clientId~description" — bearer-only resource clients,
# one per receiver. They hold the client roles and are the aud every calling
# token names.
RESOURCE_CLIENTS="
core-ledger~core-ledger API (resource)
payments~payments API (resource)
workflow~workflow API (resource)
kyc~kyc API (resource)
compliance~compliance API (resource)
reporting~reporting API (resource)
rms~rms API (resource)
notifications~notifications API (resource)
identity~identity API (resource)
audit-trail~audit-trail API (resource)
indexer~indexer API (resource)
"

# CLIENT_ROLES: "resourceClient~role~description" — the client roles on each
# resource client. One role per calling service surface.
CLIENT_ROLES="
core-ledger~ledger.user-proxy~services/bff: full user-facing + operator surface
core-ledger~ledger.settlement~services/payments: POST /wallets, /deposits, /withdrawals, /transfers
core-ledger~ledger.wallet-provision~services/identity: POST /wallets
core-ledger~ledger.wallet-status~services/kyc + services/compliance: wallet list + status
core-ledger~ledger.reserves.custodian~services/rms: custodian snapshots + reserve status
core-ledger~ledger.reserves.chain-supply~services/indexer: chain supply snapshots
core-ledger~ledger.reports.read~services/reporting: report GET surface
payments~payments.user-proxy~services/bff: banks, payment-intents, invoices
workflow~workflow.user-proxy~services/bff: the approval surface
workflow~workflow.propose~services/kyc + services/compliance + svc-core-ledger: POST /approval-requests
kyc~kyc.user-proxy~services/bff: user-facing kyc routes
kyc~kyc.tier-read~services/payments + services/bff: GET /internal/parties/:partyId/tier (H5 KYC gate)
compliance~compliance.user-proxy~services/bff: user-facing compliance routes
compliance~compliance.ingest~svc-core-ledger-worker: POST /internal/outbox
reporting~reporting.user-proxy~services/bff: user-facing reporting routes
rms~rms.user-proxy~services/bff: user-facing rms routes
notifications~notifications.user-proxy~services/bff: notifications + preferences + webhooks
notifications~notifications.ingest~svc-payments + svc-core-ledger-worker: /internal/events + /internal/outbox
identity~identity.user-proxy~services/bff: user-facing identity routes
identity~identity.resolve~svc-auth-proxy + svc-notifications: GET /internal/parties/by-subject
audit-trail~audit-trail.user-proxy~services/bff + services/reporting: GET /audit/*
audit-trail~audit-trail.ingest~every producer's svc client: POST /internal/events
indexer~indexer.finality~svc-core-ledger-worker: GET /finality/:chain/:txHash
"

# SVC_CLIENTS: "clientId~secret" — the confidential client-credentials
# clients, one per calling service. identity-service is NOT listed here: its
# secret is the realm import's placeholder and a real environment injects its
# own, so the sync must never overwrite it with a dev literal.
SVC_CLIENTS="
svc-bff~dev-svc-bff-secret
svc-payments~dev-svc-payments-secret
svc-kyc~dev-svc-kyc-secret
svc-compliance~dev-svc-compliance-secret
svc-rms~dev-svc-rms-secret
svc-reporting~dev-svc-reporting-secret
svc-indexer~dev-svc-indexer-secret
svc-core-ledger-worker~dev-svc-core-ledger-worker-secret
svc-core-ledger~dev-svc-core-ledger-secret
svc-auth-proxy~dev-svc-auth-proxy-secret
svc-workflow~dev-svc-workflow-secret
svc-notifications~dev-svc-notifications-secret
"

# AUDIENCE_MAPPERS: "clientId~audience" — one aud mapper per resource client
# the caller talks to, on every confidential caller (svc-* and
# identity-service). Without its mapper a token carries aud: ["account"] and
# the receiver 401s every call.
AUDIENCE_MAPPERS="
svc-bff~core-ledger
svc-bff~payments
svc-bff~workflow
svc-bff~kyc
svc-bff~compliance
svc-bff~reporting
svc-bff~rms
svc-bff~notifications
svc-bff~audit-trail
svc-payments~core-ledger
svc-payments~kyc
svc-payments~notifications
svc-payments~audit-trail
svc-kyc~core-ledger
svc-kyc~workflow
svc-kyc~audit-trail
svc-compliance~core-ledger
svc-compliance~workflow
svc-compliance~audit-trail
svc-rms~core-ledger
svc-rms~audit-trail
svc-reporting~core-ledger
svc-reporting~audit-trail
svc-indexer~core-ledger
svc-core-ledger-worker~notifications
svc-core-ledger-worker~compliance
svc-core-ledger-worker~indexer
svc-core-ledger-worker~audit-trail
svc-core-ledger~workflow
svc-auth-proxy~identity
svc-workflow~audit-trail
svc-notifications~identity
svc-notifications~audit-trail
identity-service~core-ledger
identity-service~audit-trail
"

# SCOPE_GRANTS: "resourceClient~targetClient~role" — grant TARGET_CLIENT's
# service account permission to include RESOURCE_CLIENT's ROLE in its own
# tokens. fullScopeAllowed:false means holding the role is not enough; the
# mapping is what makes it appear. Also implies the service-account user
# holds the role (grant_service_account_role below).
SCOPE_GRANTS="
core-ledger~svc-bff~ledger.user-proxy
core-ledger~svc-payments~ledger.settlement
core-ledger~identity-service~ledger.wallet-provision
core-ledger~svc-kyc~ledger.wallet-status
core-ledger~svc-compliance~ledger.wallet-status
core-ledger~svc-rms~ledger.reserves.custodian
core-ledger~svc-reporting~ledger.reports.read
core-ledger~svc-indexer~ledger.reserves.chain-supply
payments~svc-bff~payments.user-proxy
workflow~svc-bff~workflow.user-proxy
workflow~svc-kyc~workflow.propose
workflow~svc-compliance~workflow.propose
workflow~svc-core-ledger~workflow.propose
kyc~svc-bff~kyc.user-proxy
kyc~svc-bff~kyc.tier-read
kyc~svc-payments~kyc.tier-read
compliance~svc-bff~compliance.user-proxy
compliance~svc-core-ledger-worker~compliance.ingest
reporting~svc-bff~reporting.user-proxy
rms~svc-bff~rms.user-proxy
notifications~svc-bff~notifications.user-proxy
notifications~svc-payments~notifications.ingest
notifications~svc-core-ledger-worker~notifications.ingest
identity~svc-bff~identity.user-proxy
identity~svc-auth-proxy~identity.resolve
identity~svc-notifications~identity.resolve
audit-trail~svc-bff~audit-trail.user-proxy
audit-trail~svc-reporting~audit-trail.user-proxy
audit-trail~svc-reporting~audit-trail.ingest
audit-trail~svc-payments~audit-trail.ingest
audit-trail~svc-kyc~audit-trail.ingest
audit-trail~svc-compliance~audit-trail.ingest
audit-trail~svc-rms~audit-trail.ingest
audit-trail~identity-service~audit-trail.ingest
audit-trail~svc-core-ledger-worker~audit-trail.ingest
audit-trail~svc-workflow~audit-trail.ingest
audit-trail~svc-notifications~audit-trail.ingest
indexer~svc-core-ledger-worker~indexer.finality
"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

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
# tokens (the clientScopeMappings block of the realm import). POSTing a
# mapping that already exists is a no-op, so a re-run converges.
grant_scope_mapping() {
	local resource=$1 target=$2 role=$3 resource_uuid target_uuid role_rep
	resource_uuid=$(client_uuid "$resource")
	target_uuid=$(client_uuid "$target")
	role_rep=$(kcadm get "clients/$resource_uuid/roles/$role" -r "$REALM" --fields id,name,clientRole,containerId 2>/dev/null)
	# The mapping lives on the client that requests the token (target) and
	# names roles of the resource client. Keycloak only accepts POST here.
	kcadm create "clients/$target_uuid/scope-mappings/clients/$resource_uuid" -r "$REALM" -b "[$role_rep]" >/dev/null
	echo "keycloak-sync: granted $target -> $resource:$role"
}

# grant_service_account_role CLIENT_ID RESOURCE_CLIENT ROLE — add the role to
# the client's service-account user (users[].clientRoles in the realm
# import). add-roles is idempotent.
grant_service_account_role() {
	local client_id=$1 resource=$2 role=$3
	kcadm add-roles -r "$REALM" \
		--uusername "service-account-$client_id" \
		--cclientid "$resource" \
		--rolename "$role" >/dev/null
	echo "keycloak-sync: service-account-$client_id holds $resource:$role"
}

# mapper_json AUDIENCE — one oidc-audience-mapper ClientRepresentation
# fragment putting AUDIENCE in the token's aud claim.
mapper_json() {
	cat <<EOF
{"name": "aud-mapper-$1", "protocol": "openid-connect", "protocolMapper": "oidc-audience-mapper", "consentRequired": false, "config": {"included.client.audience": "$1", "id.token.claim": "false", "access.token.claim": "true"}}
EOF
}

# each_entry LIST_NAME FUNCTION [ARGS...] — call FUNCTION once per non-empty,
# non-comment line of the named list. Line-by-line rather than word-by-word:
# descriptions contain spaces, so plain `for entry in $LIST` would split them.
each_entry() {
	local list=$1 fn=$2 entry
	shift 2
	while IFS= read -r entry; do
		case "$entry" in
		""|\#*) continue ;;
		esac
		"$fn" "$entry" "$@"
	done <<EOL
$list
EOL
}

# svc_client_body CLIENT_ID SECRET — the full desired ClientRepresentation
# for a confidential caller: client-credentials only, service account
# enabled, full scope off, dev secret, and one audience mapper per resource
# client the caller talks to (AUDIENCE_MAPPERS).
svc_client_body() {
	local client_id=$1 secret=$2 entry client aud mappers="" first=true
	while IFS= read -r entry; do
		case "$entry" in
		""|\#*) continue ;;
		esac
		client=${entry%%~*}
		aud=${entry##*~}
		if [ "$client" != "$client_id" ]; then
			continue
		fi
		if [ "$first" = "true" ]; then
			mappers="$(mapper_json "$aud")"
			first=false
		else
			mappers="$mappers,$(mapper_json "$aud")"
		fi
	done <<EOL
$AUDIENCE_MAPPERS
EOL
	cat <<EOF
{"clientId": "$client_id", "name": "$client_id (confidential)", "enabled": true, "publicClient": false, "standardFlowEnabled": false, "directAccessGrantsEnabled": false, "serviceAccountsEnabled": true, "fullScopeAllowed": false, "secret": "$secret", "protocolMappers": [$mappers]}
EOF
}

# identity_service_body — like svc_client_body but WITHOUT a secret: the
# realm import seeds identity-service's dev placeholder, and a real
# environment injects its own — the sync must never overwrite either with a
# dev literal. (On a realm where the client is somehow missing entirely, the
# create below uses the import's placeholder secret.)
identity_service_body() {
	local entry client aud mappers="" first=true
	while IFS= read -r entry; do
		case "$entry" in
		""|\#*) continue ;;
		esac
		client=${entry%%~*}
		aud=${entry##*~}
		if [ "$client" != "identity-service" ]; then
			continue
		fi
		if [ "$first" = "true" ]; then
			mappers="$(mapper_json "$aud")"
			first=false
		else
			mappers="$mappers,$(mapper_json "$aud")"
		fi
	done <<EOL
$AUDIENCE_MAPPERS
EOL
	cat <<EOF
{"clientId": "identity-service", "name": "services/identity (confidential)", "enabled": true, "publicClient": false, "standardFlowEnabled": false, "directAccessGrantsEnabled": false, "serviceAccountsEnabled": true, "fullScopeAllowed": false, "protocolMappers": [$mappers]}
EOF
}

# upsert_resource_client ENTRY — one RESOURCE_CLIENTS line.
upsert_resource_client() {
	local entry=$1 client desc
	client=${entry%%~*}
	desc=${entry##*~}
	upsert_client "$client" \
		"{\"clientId\": \"$client\", \"name\": \"$desc\", \"enabled\": true, \"publicClient\": false, \"bearerOnly\": true, \"standardFlowEnabled\": false, \"directAccessGrantsEnabled\": false, \"serviceAccountsEnabled\": false}"
}

# upsert_role ENTRY — one CLIENT_ROLES line.
upsert_role() {
	local entry=$1 client role desc rest
	client=${entry%%~*}
	rest=${entry#*~}
	role=${rest%%~*}
	desc=${rest##*~}
	upsert_client_role "$client" "$role" "$desc"
}

# upsert_svc_client ENTRY — one SVC_CLIENTS line.
upsert_svc_client() {
	local entry=$1 client secret
	client=${entry%%~*}
	secret=${entry##*~}
	upsert_client "$client" "$(svc_client_body "$client" "$secret")"
}

# grant_both ENTRY — one SCOPE_GRANTS line: the scope mapping on the
# requesting client, and the role onto its service-account user.
grant_both() {
	local entry=$1 client target role rest
	client=${entry%%~*}
	rest=${entry#*~}
	target=${rest%%~*}
	role=${rest##*~}
	grant_scope_mapping "$client" "$target" "$role"
	grant_service_account_role "$target" "$client" "$role"
}

# upsert_all — the whole desired state, in dependency order, all of it data.
upsert_all() {
	# The bearer-only resource clients everything else references.
	each_entry "$RESOURCE_CLIENTS" upsert_resource_client

	# Their client roles.
	each_entry "$CLIENT_ROLES" upsert_role

	# The confidential service clients. identity-service is special-cased to
	# preserve whatever secret the environment injected.
	each_entry "$SVC_CLIENTS" upsert_svc_client
	if [ -n "$(client_uuid identity-service)" ]; then
		upsert_client "identity-service" "$(identity_service_body)"
	else
		upsert_client "identity-service" \
			"{\"clientId\": \"identity-service\", \"name\": \"services/identity (confidential)\", \"enabled\": true, \"publicClient\": false, \"standardFlowEnabled\": false, \"directAccessGrantsEnabled\": false, \"serviceAccountsEnabled\": true, \"fullScopeAllowed\": false, \"secret\": \"__CHANGE_ME_IN_A_REAL_ENVIRONMENT__\", \"protocolMappers\": [$(mapper_json core-ledger),$(mapper_json audit-trail)]}"
	fi

	# Scope mappings (on the requesting client) and the roles onto each
	# service-account user itself. One pass over the same data.
	each_entry "$SCOPE_GRANTS" grant_both

	echo "keycloak-sync: done"
}

if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$KEYCLOAK_CONTAINER"; then
	echo "error: container $KEYCLOAK_CONTAINER is not running (start it with scripts/stack.sh up or docker compose up -d keycloak)" >&2
	exit 1
fi

wait_for_keycloak
upsert_all
