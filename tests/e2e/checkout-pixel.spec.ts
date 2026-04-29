import { test, expect } from '@playwright/test';

/**
 * App Pixel coverage: begin_checkout.
 *
 * The App Pixel fires `checkout_started` when the buyer enters Shopify's
 * checkout, our pixel transforms it into `begin_checkout` and POSTs to
 * the Vercel relay (`/api/collect`). We capture that POST at the network
 * layer — completing payment is intentionally out of scope here, since
 * Bogus Gateway in headless is brittle and the deploy pipeline (the unit
 * we care about) is fully exercised by the `checkout_started` event.
 *
 * `purchase` (`checkout_completed`) is validated manually against GA4
 * Realtime — see README §5.
 */

const ADD_BUTTON =
  'button[name="add"]:not([disabled]), form[action*="/cart/add"] button[type="submit"]:not([disabled])';
const RELAY_URL = 'shopify-ga4-relay.vercel.app/api/collect';

test('begin_checkout reaches the Vercel relay with the correct shape', async ({ page }) => {
  await page.goto('/collections/all');
  await page.waitForLoadState('networkidle');
  await page.locator('a[href*="/products/"]').first().click();
  await page.waitForLoadState('networkidle');
  await page.locator(ADD_BUTTON).first().click();
  await page.waitForResponse((r) => r.url().includes('/cart/add') && r.status() === 200);

  const relayPost = page.waitForRequest(
    (req) =>
      req.url().includes(RELAY_URL) &&
      req.method() === 'POST' &&
      (req.postData() ?? '').includes('"begin_checkout"'),
    { timeout: 30_000 },
  );

  await page.goto('/checkout');

  const req = await relayPost;
  const body = JSON.parse(req.postData() ?? '{}');

  expect(body.shop).toMatch(/\.myshopify\.com$/);
  expect(typeof body.client_id).toBe('string');
  expect(body.client_id.length).toBeGreaterThan(0);
  expect(typeof body.nonce).toBe('string');
  expect(typeof body.ts).toBe('number');
  expect(Array.isArray(body.events)).toBe(true);
  expect(body.events).toHaveLength(1);

  const ev = body.events[0];
  expect(ev.name).toBe('begin_checkout');
  expect(ev.params.currency).toBe('EUR');
  expect(typeof ev.params.value).toBe('number');
  expect(ev.params.value).toBeGreaterThan(0);
  expect(Array.isArray(ev.params.items)).toBe(true);
  expect(ev.params.items.length).toBeGreaterThan(0);
});
