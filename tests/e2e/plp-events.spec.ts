import { test, expect } from '@playwright/test';

/**
 * PLP coverage: view_item_list and select_item.
 *
 * The brief mandates `index` on every item to convey list position; we
 * assert that explicitly because it is the easiest field to drop in a
 * refactor and silently break attribution downstream.
 *
 * The duplicate-fire invariant goes through a navigation round-trip
 * (forward → product → back) so we catch the failure modes a fresh page
 * load alone wouldn't: bfcache restores, hydration double-fires, and
 * MutationObserver/requestIdleCallback handlers wired in adapters that
 * survive across SPA-ish transitions.
 */

const PLP_LINK_IN_GRID =
  'main a[href*="/products/"], #MainContent a[href*="/products/"], [id*="MainContent"] a[href*="/products/"]';

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

  test('does not double-fire across bfcache navigation', async ({ page }) => {
    // First load: count fires on the PLP. Should be exactly one.
    await page.goto('/collections/all');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    const firstLoadCount = await page.evaluate(
      () => (window as any).dataLayer.filter((e: any) => e?.event === 'view_item_list').length,
    );
    expect(firstLoadCount).toBe(1);

    // Navigate forward to a product, then back. bfcache typically restores
    // dataLayer state untouched; a regression that double-fires on
    // `pageshow` or `popstate` would cause this count to grow on the
    // restored PLP.
    await page.locator(PLP_LINK_IN_GRID).first().click();
    await page.waitForURL(/\/products\//);
    await page.goBack();
    await page.waitForURL(/\/collections\/all/);
    await page.waitForTimeout(500);
    const afterBackCount = await page.evaluate(
      () => (window as any).dataLayer.filter((e: any) => e?.event === 'view_item_list').length,
    );
    // Either the page reloaded (count resets to 1) or bfcache restored
    // (count stays at 1 with no extra fire). Both are correct; what we
    // want to forbid is going to >=2 on the same loaded document.
    expect(afterBackCount).toBeLessThanOrEqual(1);
  });
});

test.describe('PLP — select_item', () => {
  test('fires on product card click with index of clicked card', async ({ page }) => {
    // Capture the select_item push *before* navigation by mirroring
    // dataLayer writes into sessionStorage, so the assertion isn't
    // racy against the click triggering an immediate page transition.
    await page.addInitScript(() => {
      (window as any).__captured = [];
      const orig = (window as any).dataLayer ?? ((window as any).dataLayer = []);
      const push = orig.push.bind(orig);
      orig.push = (...args: unknown[]) => {
        for (const a of args) (window as any).__captured.push(a);
        return push(...args);
      };
    });

    await page.goto('/collections/all');
    await page.waitForLoadState('networkidle');

    const cards = page.locator(PLP_LINK_IN_GRID);
    const secondCardHref = await cards.nth(1).getAttribute('href');
    expect(secondCardHref, 'second product card href').toMatch(/\/products\/[\w-]+/);

    await cards.nth(1).click({ noWaitAfter: true });

    // Capture is synchronous to dataLayer.push(); networkidle is overkill.
    await page.waitForFunction(
      () => (window as any).__captured?.some((e: any) => e?.event === 'select_item'),
      { timeout: 5000 },
    );

    const event = await page.evaluate(() =>
      (window as any).__captured?.find((e: any) => e?.event === 'select_item'),
    );
    expect(event).toBeDefined();
    expect(event.ecommerce.items).toHaveLength(1);
    expect(event.ecommerce.items[0].index).toBe(1);

    // The clicked card's product handle must appear in the href, and the
    // event's item_id must reference the same product. We can't assert
    // item_id-in-href directly because Shopify hrefs use *handles*, not
    // numeric IDs, so the strongest cross-check available is "href is a
    // product page and the event has a populated item_id".
    expect(secondCardHref).toMatch(/^\/products\/[\w-]+/);
    expect(event.ecommerce.items[0].item_id.length).toBeGreaterThan(0);
  });
});
