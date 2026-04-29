import { test, expect } from '@playwright/test';
import { GA4Event } from '../../src/datalayer/schema';

/**
 * Schema-conformance test.
 *
 * Drives a representative storefront flow (PLP → PDP → cart) and then
 * validates EVERY ecommerce event captured in window.dataLayer against
 * the canonical Zod schema (src/datalayer/schema.ts) — the same schema
 * that the runtime safePush uses to gate publishing. Any drift between
 * what the storefront pushes and the contract our types claim is caught
 * here, end-to-end, with no mocks.
 */

const ADD_BUTTON =
  'button[name="add"]:not([disabled]), form[action*="/cart/add"] button[type="submit"]:not([disabled])';

test('every captured GA4 event passes the canonical Zod schema', async ({ page }) => {
  await page.goto('/collections/all');
  await page.waitForLoadState('networkidle');

  await page.locator('a[href*="/products/"]').first().click();
  await page.waitForLoadState('networkidle');

  await page.locator(ADD_BUTTON).first().click();
  await page.waitForResponse((r) => r.url().includes('/cart/add') && r.status() === 200);
  await page.waitForTimeout(300);

  await page.goto('/cart');
  await page.waitForLoadState('networkidle');

  const allEvents = await page.evaluate(
    () =>
      (window as any).dataLayer.filter(
        (e: any) =>
          e &&
          typeof e === 'object' &&
          typeof e.event === 'string' &&
          e.ecommerce !== undefined,
      ),
  );

  expect(allEvents.length).toBeGreaterThan(0);

  const failures: Array<{ event: string; index: number; errors: string }> = [];
  allEvents.forEach((evt: unknown, idx: number) => {
    const result = GA4Event.safeParse(evt);
    if (!result.success) {
      failures.push({
        event: (evt as { event?: string }).event ?? '<unknown>',
        index: idx,
        errors: result.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; '),
      });
    }
  });

  if (failures.length > 0) {
    const summary = failures
      .map((f) => `  - dataLayer[${f.index}] (${f.event}): ${f.errors}`)
      .join('\n');
    throw new Error(
      `${failures.length} of ${allEvents.length} ecommerce events failed schema:\n${summary}`,
    );
  }

  // We expect the canonical brief events at minimum on this flow.
  const captured = new Set(allEvents.map((e: { event: string }) => e.event));
  for (const required of ['view_item_list', 'view_item', 'add_to_cart', 'view_cart']) {
    expect(captured, `expected ${required} in this flow`).toContain(required);
  }
});
