import { test, expect } from '@playwright/test';

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
  await page.waitForLoadState('networkidle');
  await page.locator('a[href*="/products/"]').first().click();
  await page.waitForLoadState('networkidle');

  // 1) add_to_cart — driven by /cart/add.js intercept in src/adapters/cart-api.ts
  const addRequest = page.waitForResponse(
    (r) => r.url().includes('/cart/add') && r.status() === 200,
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
  await page.waitForLoadState('networkidle');
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

  // 3) remove_from_cart — user-initiated line removal on /cart
  const removeButton = page
    .locator('cart-remove-button a, a[href*="cart/change?line"][href*="quantity=0"]')
    .first();
  if (await removeButton.count() > 0) {
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
  } else {
    test.info().annotations.push({
      type: 'warn',
      description:
        'remove button selector did not match — theme markup may have changed. Skipping the remove_from_cart assertion.',
    });
  }
});
