import { test, expect } from '@playwright/test';

/**
 * The P1 DoD, end to end (docs/building-plan.md): log in through Keycloak
 * with a real password, land on the dashboard, see real wallets/balances.
 * Requires the full local stack — see playwright.config.ts's header comment.
 */
test.describe('P1 login flow', () => {
  test('customer logs in via Keycloak PKCE and lands on a real dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: /sign in/i }).click();

    // Hands off to Keycloak's hosted login form (its default theme's field
    // ids) — this is the point at which a real browser leaves the SPA's
    // origin entirely, which is the thing password-grant (the old flow)
    // never did.
    await page.waitForURL(/\/protocol\/openid-connect\/auth/);
    await page.locator('#username').fill('customer@damp.local');
    await page.locator('#password').fill('damp-dev-only');
    await page.locator('#kc-login').click();

    await page.waitForURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    // The one thing every P1 DoD line insists on: whatever the dashboard
    // renders for a balance, it's a Money.display string, never a bare
    // float — no unformatted decimal with more than 2-6 digits after the
    // point ever appears unlabeled with a currency.
    await expect(page.locator('body')).not.toContainText(/\b\d+\.\d{7,}\b/);
  });

  test('a forged X-User-Id is rejected at the gateway', async ({ request }) => {
    // core-ledger itself (:8081) is deliberately still reachable from
    // localhost in this dev setup — P0's own DoD verifies it directly
    // (`curl :8081/readyz`). Network isolation is a k8s NetworkPolicy
    // concern (infra/k8s), not something a local dev-mode Playwright run
    // against `make run` processes can assert.
    const gatewayResponse = await request.get('http://localhost:8082/api/wallets', {
      headers: { 'X-User-Id': 'someone-else' },
      failOnStatusCode: false,
    });
    expect(gatewayResponse.status()).toBe(401);
  });
});
