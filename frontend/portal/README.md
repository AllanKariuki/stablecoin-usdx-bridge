# DAMP Self-Service portal

This is the customer and business app for the `customer` and `company` roles. It runs on **:5173**, which the `damp-portal` Keycloak client's redirect URI depends on. Staff sign in at the Ops Console (`frontend/ops-console`, :5174) instead. Both apps are built on `@damp/web-shared` (`frontend/shared`), which provides the design tokens, components, auth, API client and app shell.

```bash
pnpm --filter portal dev       # http://localhost:5173
pnpm --filter portal test      # vitest
pnpm --filter portal build     # tsc -b && vite build
pnpm --filter portal e2e       # Playwright, against the full local stack
```

## Routes

| Path | Screen |
|---|---|
| `/` | Public landing page. **Sign in** and **Open an account** go to Keycloak's hosted pages. |
| `/auth/callback` | PKCE callback |
| `/pay/:payToken` | Public invoice payment link, which services/payments sends to payers |
| `/home` | Balances, recent activity, quick actions, KYC banner, pending approvals |
| `/wallets`, `/wallets/:id` | Wallets, plus a statement with date filters and an explanation when a wallet is frozen |
| `/move/{deposit,withdraw,transfer}` | Ledger money movement in three steps: form, review, receipt |
| `/usdx` | Issue and redeem USD-X, with a live saga timeline and explorer links |
| `/transactions` | Cursor-paginated history, with a drawer showing the double-entry legs |
| `/payments`, `/payments/{invoices,banks,payees}` | Payment intents, invoices, linked banks and mobile money, payees |
| `/verification` | KYC tier, limits, document upload and submission |
| `/notifications` | Inbox fed by the WebSocket, plus notification preferences |
| `/approvals` | Maker-checker inbox. Shown only to roles that hold `approvals:*`. |
| `/settings` | Profile, a link to Keycloak's account console for security settings, and webhooks |

## Rules this app follows

- No password is ever typed into this app. Every sign-in goes through Keycloak with authorization code + PKCE.
- Nav items and routes are filtered by permission (`src/nav.ts`, `RequirePermission`). The API's 403 is still the real gate.
- Money is always rendered as `Money.display`. The ESLint rule stops a Money field from being coerced to a number anywhere in `src/`.
- Money-moving writes go through a review step. That step mints one `Idempotency-Key`, and every retry of the same submit reuses it.

## Runtime config

`public/runtime-config.js` holds the gateway URL, the Keycloak authority and client, the redirect URI and the WebSocket URL. You can also set `VITE_PAYMENTS_PUBLIC_URL` (default `http://localhost:3003`), which is the public origin that payment links resolve against. That route is deliberately not behind the gateway.
