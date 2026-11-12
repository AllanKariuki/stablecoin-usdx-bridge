import { test, expect } from '@playwright/test';

/**
 * The P1 DoD, end to end (docs/building-plan.md): sign in through Keycloak's
 * hosted page (the DAMP login theme keeps Keycloak's #username / #password /
 * #kc-login ids), land on Home, see real balances. Requires the full local
 * stack — see playwright.config.ts's header comment.
 */
test.describe('P1 login flow', () => {
  test('customer signs in via Keycloak PKCE and lands on Home', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Sign in' }).first().click();

    await page.waitForURL(/\/protocol\/openid-connect\/auth/);
    await page.locator('#username').fill('customer@damp.local');
    await page.locator('#password').fill('damp-dev-only');
    await page.locator('#kc-login').click();

    await page.waitForURL(/\/home$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Hello');

    // Whatever renders as a balance is a Money.display string, never a bare float.
    await expect(page.locator('body')).not.toContainText(/\b\d+\.\d{7,}\b/);
  });

  test('a forged X-User-Id is rejected at the gateway', async ({ request }) => {
    const gatewayResponse = await request.get('http://localhost:8082/api/wallets', {
      headers: { 'X-User-Id': 'someone-else' },
      failOnStatusCode: false,
    });
    expect(gatewayResponse.status()).toBe(401);
  });
});
