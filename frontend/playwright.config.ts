import { defineConfig, devices } from '@playwright/test';

/**
 * Runs against a live stack, not a mocked one — per docs/building-plan.md's
 * P1 Verify section ("npx playwright test e2e/login.spec.ts"). That means
 * Keycloak (:8080, realm `damp` imported), Traefik (:8082), auth-proxy, bff
 * and core-ledger all need to already be up (`make up`, then `make run` for
 * the host-mode services — see infra/traefik/dynamic.yaml) and the Vite dev
 * server running on :5173, matching the Keycloak client's redirect URI.
 * No webServer block here on purpose: starting the frontend alone would
 * still fail against a Keycloak/bff that isn't running, so failing fast
 * with a clear "not reachable" error is more honest than half-booting one
 * piece of a multi-service stack.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
