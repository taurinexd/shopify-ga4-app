import { test, expect } from '@playwright/test';

test('view_item_list fires on /collections/all with proper structure', async ({ page }) => {
  await page.goto('/collections/all');
  await page.waitForLoadState('networkidle');
  const event = await page.evaluate(() =>
    (window as any).dataLayer?.find((e: any) => e?.event === 'view_item_list')
  );
  expect(event).toBeDefined();
  expect(event.ecommerce.items.length).toBeGreaterThan(0);
  expect(event.ecommerce.items[0]).toMatchObject({
    item_id: expect.any(String),
    item_name: expect.any(String),
    price: expect.any(Number),
    index: 0,
  });
});

test('select_item fires on product card click and includes index', async ({ page }) => {
  await page.goto('/collections/all');
  await page.locator('a[href*="/products/"]').first().click({ trial: true });
  await page.waitForTimeout(100);
  await page.locator('a[href*="/products/"]').first().click();
  const event = await page.evaluate(() =>
    (window as any).dataLayer?.find((e: any) => e?.event === 'select_item')
  );
  expect(event).toBeDefined();
  expect(event.ecommerce.items[0].index).toBe(0);
});
