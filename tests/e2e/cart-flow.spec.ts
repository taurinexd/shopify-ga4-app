import { test, expect } from '@playwright/test';

test('add_to_cart → view_cart → remove_from_cart sequence', async ({ page }) => {
  await page.goto('/collections/all');
  await page.locator('a[href*="/products/"]').first().click();
  await page.waitForLoadState('networkidle');
  await page.locator('button[name="add"], form[action*="/cart/add"] [type="submit"]').first().click();
  await page.waitForResponse((r) => r.url().includes('/cart/add'));

  await page.goto('/cart');
  await page.waitForLoadState('networkidle');
  const events = await page.evaluate(() => (window as any).dataLayer.map((e: any) => e?.event));
  expect(events).toContain('add_to_cart');
  expect(events).toContain('view_cart');
});
