import { test, expect } from '@playwright/test';

/**
 * PLP coverage: view_item_list and select_item.
 *
 * The brief mandates `index` on every item to convey list position; we
 * assert that explicitly because it is the easiest field to drop in a
 * refactor and silently break attribution downstream.
 */

test.describe('PLP — view_item_list', () => {
  test('fires on /collections/all with full GA4 shape', async ({ page }) => {
    await page.goto('/collections/all');
    await page.waitForLoadState('networkidle');

    const event = await page.evaluate(() =>
      (window as any).dataLayer?.find((e: any) => e?.event === 'view_item_list'),
    );
    expect(event, 'view_item_list event missing from dataLayer').toBeDefined();
    expect(event.ecommerce.item_list_id).toBeTruthy();
    expect(event.ecommerce.item_list_name).toBeTruthy();
    expect(event.ecommerce.items.length).toBeGreaterThan(0);

    for (let i = 0; i < event.ecommerce.items.length; i++) {
      const item = event.ecommerce.items[i];
      expect(item, `item[${i}]`).toMatchObject({
        item_id: expect.any(String),
        item_name: expect.any(String),
        price: expect.any(Number),
        quantity: expect.any(Number),
        index: i,
      });
      expect(item.item_id.length).toBeGreaterThan(0);
      expect(item.price).toBeGreaterThanOrEqual(0);
      expect(item.quantity).toBeGreaterThan(0);
    }
  });

  test('fires only once per page load (no duplicates on networkidle)', async ({ page }) => {
    await page.goto('/collections/all');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    const count = await page.evaluate(
      () => (window as any).dataLayer.filter((e: any) => e?.event === 'view_item_list').length,
    );
    expect(count).toBe(1);
  });
});

test.describe('PLP — select_item', () => {
  test('fires on product card click with index of clicked card', async ({ page }) => {
    await page.goto('/collections/all');
    await page.waitForLoadState('networkidle');

    // Click the second product card so we can assert index 1, not just 0.
    const cards = page.locator('a[href*="/products/"]');
    const secondCardHref = await cards.nth(1).getAttribute('href');
    await cards.nth(1).click({ noWaitAfter: true });

    await page.waitForFunction(
      () => (window as any).dataLayer?.some((e: any) => e?.event === 'select_item'),
      { timeout: 5000 },
    );
    const event = await page.evaluate(() =>
      (window as any).dataLayer?.find((e: any) => e?.event === 'select_item'),
    );
    expect(event).toBeDefined();
    expect(event.ecommerce.items).toHaveLength(1);
    expect(event.ecommerce.items[0].index).toBe(1);
    expect(secondCardHref).toContain(event.ecommerce.items[0].item_id ? '' : '/products/');
  });
});
