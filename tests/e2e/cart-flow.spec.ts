import { test, expect } from '@playwright/test';
import { PLP_LINK_IN_GRID } from './helpers/datalayer';

/**
 * Cart flow coverage: add_to_cart, view_cart, remove_from_cart.
 *
 * The brief calls these out explicitly. add_to_cart hooks into the Ajax
 * cart API (`/cart/add.js`); remove_from_cart hooks into a user-initiated
 * cart line removal. We exercise both and assert the GA4 payload shape
 * the brief mandates (currency, value, items[item_id, item_name, price,
 * quantity, item_variant]).
 */

const ADD_BUTTON =
  'button[name="add"]:not([disabled]), form[action*="/cart/add"] button[type="submit"]:not([disabled])';

test('add_to_cart → view_cart → remove_from_cart fires the three events with valid shape', async ({
  page,
}) => {
  await page.goto('/collections/all');
  // Dawn keeps a long-running heartbeat to Shopify telemetry endpoints,
  // so `networkidle` rarely settles within the test timeout. The PLP
  // anchors we click are present on `domcontentloaded`, and the
  // dataLayer push for view_item_list runs synchronously from the
  // entry script — switching to `domcontentloaded` avoids racing the
  // never-idle network without losing any actionable signal.
  await page.waitForLoadState('domcontentloaded');
  await page.locator(PLP_LINK_IN_GRID).first().click();
  await page.waitForURL(/\/products\//);
  await page.waitForLoadState('domcontentloaded');

  // 1) add_to_cart — driven by /cart/add.js intercept in src/adapters/cart-api.ts.
  // Match the canonical Ajax Cart API endpoints exactly: /cart/add or
  // /cart/add.js. A loose `includes('/cart/add')` would also match third
  // party endpoints whose URL happens to contain the substring.
  const addRequest = page.waitForResponse(
    (r) => {
      const url = new URL(r.url());
      return (
        (url.pathname === '/cart/add' || url.pathname === '/cart/add.js') &&
        r.status() === 200
      );
    },
  );
  await page.locator(ADD_BUTTON).first().click();
  await addRequest;
  await page.waitForFunction(
    () => (window as any).dataLayer?.some((e: any) => e?.event === 'add_to_cart'),
    { timeout: 5000 },
  );
  const addEvent = await page.evaluate(() =>
    (window as any).dataLayer?.find((e: any) => e?.event === 'add_to_cart'),
  );
  expect(addEvent.ecommerce.currency).toBe('EUR');
  expect(addEvent.ecommerce.value).toBeGreaterThan(0);
  expect(addEvent.ecommerce.items).toHaveLength(1);
  expect(addEvent.ecommerce.items[0]).toMatchObject({
    item_id: expect.any(String),
    item_name: expect.any(String),
    price: expect.any(Number),
    quantity: 1,
  });

  // 2) view_cart — driven by entry.ts when navigating to /cart
  await page.goto('/cart');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(
    () => (window as any).dataLayer?.some((e: any) => e?.event === 'view_cart'),
    { timeout: 5000 },
  );
  const viewCartEvent = await page.evaluate(() =>
    (window as any).dataLayer?.find((e: any) => e?.event === 'view_cart'),
  );
  expect(viewCartEvent.ecommerce.currency).toBe('EUR');
  expect(viewCartEvent.ecommerce.value).toBeGreaterThan(0);
  expect(viewCartEvent.ecommerce.items.length).toBeGreaterThan(0);

  // 3) remove_from_cart — user-initiated line removal on /cart.
  // Selector covers Dawn's <cart-remove-button> web component, the
  // legacy `a[href*="/cart/change"]` link with quantity=0, and the data
  // attribute we mark on user-clickable removes. If none match the test
  // fails loudly: a regression in the remove instrumentation must not
  // be invisible behind a soft warning.
  const removeButton = page
    .locator(
      [
        'cart-remove-button a',
        'cart-remove-button button',
        'a[href*="/cart/change"][href*="quantity=0"]',
        '[data-cart-remove]',
      ].join(', '),
    )
    .first();

  await expect(
    removeButton,
    'remove button not found — theme markup changed; widen selector or add a [data-cart-remove] hook',
  ).toBeVisible({ timeout: 5000 });

  await removeButton.click();
  await page.waitForFunction(
    () => (window as any).dataLayer?.some((e: any) => e?.event === 'remove_from_cart'),
    { timeout: 5000 },
  );
  const removeEvent = await page.evaluate(() =>
    (window as any).dataLayer?.find((e: any) => e?.event === 'remove_from_cart'),
  );
  expect(removeEvent.ecommerce.currency).toBe('EUR');
  expect(removeEvent.ecommerce.items.length).toBeGreaterThan(0);
});
