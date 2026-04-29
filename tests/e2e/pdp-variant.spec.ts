import { test, expect } from '@playwright/test';

const MULTI_VARIANT_HANDLE = 'the-complete-snowboard';

test('view_item re-fires on variant change without reload', async ({ page }) => {
  await page.goto(`/products/${MULTI_VARIANT_HANDLE}`);
  await page.waitForLoadState('domcontentloaded');
  const initial = await page.evaluate(() =>
    (window as any).dataLayer.filter((e: any) => e?.event === 'view_item').length
  );
  // Dawn renders variant radios inside a `<fieldset class="...pill">`
  // whose ::before/::after pseudo-elements stretch over the inputs and
  // intercept pointer events at the element layer (Playwright sees
  // "fieldset intercepts pointer events" and times out). Clicking the
  // associated <label> is what real users hit anyway, and it propagates
  // a `change` to the input so the variant observer reacts identically.
  const variantInputs = page.locator(
    'variant-radios input[type="radio"], variant-selects input[type="radio"]',
  );
  if (await variantInputs.count() > 1) {
    const target = variantInputs.nth(1);
    const id = await target.getAttribute('id');
    if (id) {
      await page.locator(`label[for="${id}"]`).click();
    } else {
      await target.click({ force: true });
    }
    await page.waitForTimeout(300);
  }
  const after = await page.evaluate(() =>
    (window as any).dataLayer.filter((e: any) => e?.event === 'view_item').length
  );
  expect(after).toBe(initial + 1);
});
