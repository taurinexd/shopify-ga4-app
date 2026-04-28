import { test, expect } from '@playwright/test';

const MULTI_VARIANT_HANDLE = 'the-complete-snowboard';

test('view_item re-fires on variant change without reload', async ({ page }) => {
  await page.goto(`/products/${MULTI_VARIANT_HANDLE}`);
  await page.waitForLoadState('networkidle');
  const initial = await page.evaluate(() =>
    (window as any).dataLayer.filter((e: any) => e?.event === 'view_item').length
  );
  const variantInputs = page.locator('variant-radios input[type="radio"], variant-selects input[type="radio"]');
  if (await variantInputs.count() > 1) {
    await variantInputs.nth(1).click();
    await page.waitForTimeout(300);
  }
  const after = await page.evaluate(() =>
    (window as any).dataLayer.filter((e: any) => e?.event === 'view_item').length
  );
  expect(after).toBe(initial + 1);
});
