import { request } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * Bypass storefront password protection once and persist cookies via storageState.
 *
 * Shopify gates the storefront with the `_shopify_essential` cookie (not the
 * legacy `storefront_digest`). Submitting POST /password with a valid
 * `authenticity_token` mints a fresh `_shopify_essential` value that grants
 * access. We then verify by GET / and asserting it does NOT redirect to
 * /password.
 */
export default async function globalSetup(): Promise<void> {
  const baseURL = process.env.SHOPIFY_DEV_STORE_URL;
  const password = process.env.STOREFRONT_PASSWORD;
  if (!baseURL || !password) {
    const missing = [
      !baseURL && 'SHOPIFY_DEV_STORE_URL',
      !password && 'STOREFRONT_PASSWORD',
    ]
      .filter(Boolean)
      .join(' and ');
    throw new Error(
      `e2e setup: ${missing} not set. The storefront is password-protected; ` +
        `every spec needs an unlocked session. Set both env vars before running ` +
        `\`npm run test:e2e\` (locally) or configure them as GitHub Actions ` +
        `secrets (CI). See README §6 for the bypass mechanism.`,
    );
  }

  const ctx = await request.newContext({ baseURL });

  // Step 1: GET /password to establish session cookies and grab authenticity_token
  const getResp = await ctx.get('/password', { failOnStatusCode: false });
  if (!getResp.ok()) {
    throw new Error(`GET /password returned ${getResp.status()}`);
  }
  const html = await getResp.text();
  const tokenMatch = html.match(/name="authenticity_token"\s+value="([^"]+)"/);
  if (!tokenMatch) {
    throw new Error('authenticity_token not found on /password — page layout changed?');
  }
  const authenticityToken = tokenMatch[1];

  // Step 2: POST /password with full form payload
  const postResp = await ctx.post('/password', {
    form: {
      form_type: 'storefront_password',
      utf8: '✓',
      password,
      authenticity_token: authenticityToken,
    },
    maxRedirects: 0,
    failOnStatusCode: false,
  });
  if (postResp.status() !== 302) {
    throw new Error(`POST /password returned ${postResp.status()} (expected 302)`);
  }
  const location = postResp.headers()['location'] ?? '';
  if (location.endsWith('/password')) {
    throw new Error('POST /password redirected back to /password — wrong password?');
  }

  // Step 3: Verify access by GET / and confirming we stay on / (no redirect to /password)
  const verifyResp = await ctx.get('/', { maxRedirects: 0, failOnStatusCode: false });
  if (verifyResp.status() === 302) {
    const verifyLoc = verifyResp.headers()['location'] ?? '';
    if (verifyLoc.endsWith('/password')) {
      throw new Error('Verification GET / redirected to /password — auth did not stick');
    }
  }

  // Step 4: Persist storage state for tests to reuse
  const state = await ctx.storageState();
  const storageDir = path.join(process.cwd(), 'tests/e2e/.auth');
  fs.mkdirSync(storageDir, { recursive: true });
  fs.writeFileSync(path.join(storageDir, 'storefront.json'), JSON.stringify(state, null, 2));
  await ctx.dispose();

  // Confirm at least one Shopify session cookie present
  const hasShopifyCookie = state.cookies.some((c) =>
    c.name === '_shopify_essential' || c.name === 'storefront_digest'
  );
  if (!hasShopifyCookie) {
    throw new Error('No Shopify session cookie persisted — auth flow broken');
  }
}
