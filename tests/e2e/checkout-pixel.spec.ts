import { test, expect } from '@playwright/test';

/**
 * App Pixel coverage: begin_checkout.
 *
 * The App Pixel fires `checkout_started` when the buyer enters Shopify's
 * checkout, our pixel transforms it into `begin_checkout` and POSTs to
 * the relay (`/api/collect`). We capture that POST at the network layer
 * — completing payment is intentionally out of scope here, since Bogus
 * Gateway in headless is brittle and the deploy pipeline (the unit we
 * care about) is fully exercised by the `checkout_started` event.
 *
 * `purchase` (`checkout_completed`) is validated manually against GA4
 * Realtime — see README §5.
 */

const ADD_BUTTON =
  'button[name="add"]:not([disabled]), form[action*="/cart/add"] button[type="submit"]:not([disabled])';

// Override the relay URL via env if the pixel and the test are pointed
// at a different deploy (e.g. a preview Vercel URL). Default mirrors the
// production host the pixel hardcodes in extensions/ga4-pixel/src/index.ts.
const RELAY_HOST = process.env.RELAY_HOST ?? 'shopify-ga4-relay.vercel.app';
const RELAY_URL_FRAGMENT = `${RELAY_HOST}/api/collect`;

test('begin_checkout reaches the relay with the correct shape', async ({ page }) => {
  await page.goto('/collections/all');
  await page.waitForLoadState('networkidle');
  await page.locator('a[href*="/products/"]').first().click();
  await page.waitForLoadState('networkidle');
  await page.locator(ADD_BUTTON).first().click();
  await page.waitForResponse(
    (r) => {
      const u = new URL(r.url());
      return (
        (u.pathname === '/cart/add' || u.pathname === '/cart/add.js') &&
        r.status() === 200
      );
    },
  );

  const relayPost = page.waitForRequest(
    (req) =>
      req.url().includes(RELAY_URL_FRAGMENT) &&
      req.method() === 'POST' &&
      (req.postData() ?? '').includes('"begin_checkout"'),
    { timeout: 30_000 },
  );

  await page.goto('/checkout');
  // If the cart was empty, Shopify redirects /checkout -> /cart with no
  // pixel firing; if shipping/required fields fail validation, we may
  // land on a 422 page that never starts the pixel either. Assert we
  // reached the checkout flow before waiting on the network beacon, so
  // a misconfiguration earlier in the test gives a clear error rather
  // than a 30-second silent timeout.
  await expect(page).toHaveURL(/\/(checkout|checkouts)\b/, { timeout: 10_000 });

  const req = await relayPost;
  const body = JSON.parse(req.postData() ?? '{}');

  // Tighten the shop assertion: we know exactly which dev store this
  // test is configured against via SHOPIFY_DEV_STORE_URL, no need to
  // accept any *.myshopify.com.
  const expectedShop = process.env.SHOPIFY_DEV_STORE_URL
    ? new URL(process.env.SHOPIFY_DEV_STORE_URL).hostname.toLowerCase()
    : null;
  if (expectedShop) {
    expect(body.shop).toBe(expectedShop);
  } else {
    expect(body.shop).toMatch(/^[a-z0-9-]+\.myshopify\.com$/);
  }

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
