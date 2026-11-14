# Ops Console

The DAMP staff console. It is one shell with four role-scoped workspaces (see `docs/frontend-ui-prd.md` §7), built on
`@damp/web-shared` (`frontend/shared`).

```bash
pnpm --filter ops-console dev     # http://localhost:5174 (the port is fixed; see below)
pnpm --filter ops-console test
pnpm --filter ops-console build
make frontend-dev                 # portal (:5173) and console (:5174) together
```

It signs in through Keycloak client `damp-ops` (PKCE S256, public). Port 5174 is that client's redirect URI and an allowed
origin in `infra/traefik/dynamic.yaml`. Only `admin`, `compliance`, `treasury` and `auditor` can get in. Anyone else sees
a page that points them to the portal.

## Workspaces

A workspace is a view, not a permission boundary. It picks the nav and the overview. Every route is guarded by
permission, and the API's 403 is the real gate. Users who hold more than one staff role get a switcher.

| Workspace | Overview | Screens |
|---|---|---|
| Compliance | KYC queue, open alerts and cases, pending approvals | `/kyc`, `/kyc/:id`, `/alerts`, `/cases`, `/cases/:id` (notes, assign, close or SAR), `/enforcement`, `/screening` |
| Treasury | Reserves: issued, backing, coverage against mandate, legs A/B/C | `/reconciliation` (runs, open breaks), `/custodians` (statements, reserve targets), `/attestations`, `/ledger` (trial balance, integrity, accounts, period close), `/reports` |
| Admin | Approvals, breaks, chain status, latest runs | `/directory`, `/reconciliation`, `/reports`, `/audit` |
| Auditor | Chain verification, latest runs and anchors | `/audit` (events, Merkle proofs, anchors), `/reports` (runs, CSV), `/reconciliation`, `/attestations`, `/ledger` |
| All | | `/wallets` and `/wallets/:id` (freeze/unfreeze), `/transactions` and `/transactions/:id` (reversal with a contra-entry preview), `/approvals` |

Controls a user can't use are missing from the page, not just disabled (`<Can>`). An auditor-only user sees no
mutating control anywhere: `src/test/readOnly.test.tsx` asserts this for wallet detail, transaction detail and
approvals. The one exception is "Run report", which records a report run (`reports:read`) and changes nothing else.

## Data

Every request goes through the gateway to bff. Ledger operator routes (`/accounts`, `/ledger/*`, reversal) and
reconciliation history come from core-ledger unchanged, so they arrive in snake_case with decimal strings. rms
supplies Money-shaped reserve status. Figures are rendered as given and never converted to numbers (the eslint
money rule covers all of `src`).
