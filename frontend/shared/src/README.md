# @damp/web-shared

What both DAMP web apps (`frontend/portal`, `frontend/ops-console`) build on:

| Path | What |
|---|---|
| `src/styles/theme.css` | Design tokens (Tailwind 4 `@theme`) and base styles. The Keycloak theme copies these values by hand. |
| `src/auth` | Keycloak auth-code + PKCE, token refresh, `AuthProvider`/`useAuth`, role → permission expansion from `shared/authz`, and the `RequireAuth`/`RequireRole`/`RequirePermission`/`Can` guards. |
| `src/api` | The gateway HTTP client (bearer token, one retry after refreshing on a 401, Idempotency-Key helper, readable error messages), the `Money` type, and one module per backend domain. |
| `src/ui` | Components: buttons, cards, badges, forms, tables, dialogs, tabs, feedback states. |
| `src/layout` | `AppShell` (floating navy sidebar plus top bar, with nav filtered by permission) and `AppRoot` (the providers). |
| `src/pages` | The 404, 403, 500 and offline pages, and the error boundary. |

It is source-only, with no build step: apps import it as `@damp/web-shared/<area>` and Vite compiles it.
Each app's CSS must `@source` this folder so Tailwind generates the classes used here.

Rules that hold everywhere:
- Render `Money.display`, and never do arithmetic on `amount`.
- Every money-moving write sends an `Idempotency-Key` that is created once for each confirm step.
- A nav item or control the user can't use is absent, not disabled. The auditor workspace has no mutating control at all.
