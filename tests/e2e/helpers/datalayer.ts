import type { Page } from '@playwright/test';

/**
 * Shared dataLayer helpers. All e2e specs use these so we have one place
 * to update the dataLayer access pattern when storage moves (e.g. if we
 * ever switch to GTM's gtag.js shim, the shape changes).
 */

export type DataLayerEvent = {
  event?: string;
  ecommerce?: unknown;
} & Record<string, unknown>;

export async function findEvent(page: Page, name: string): Promise<DataLayerEvent | undefined> {
  return page.evaluate(
    (n: string) =>
      (window as { dataLayer?: DataLayerEvent[] }).dataLayer?.find(
        (e) => e?.event === n,
      ),
    name,
  );
}

export async function allEvents(page: Page): Promise<DataLayerEvent[]> {
  return page.evaluate(
    () => (window as { dataLayer?: DataLayerEvent[] }).dataLayer ?? [],
  );
}

export async function ecommerceEvents(page: Page): Promise<DataLayerEvent[]> {
  return page.evaluate(() =>
    ((window as { dataLayer?: DataLayerEvent[] }).dataLayer ?? []).filter(
      (e) =>
        e !== null &&
        typeof e === 'object' &&
        typeof (e as DataLayerEvent).event === 'string' &&
        (e as DataLayerEvent).ecommerce !== undefined,
    ),
  );
}

export async function eventCount(page: Page, name: string): Promise<number> {
  return page.evaluate(
    (n: string) =>
      ((window as { dataLayer?: DataLayerEvent[] }).dataLayer ?? []).filter(
        (e) => e?.event === n,
      ).length,
    name,
  );
}

/**
 * PLP product-card link selector that picks a *visible*, *addable*
 * product anchor inside the main content region.
 *
 * Three filters at play:
 *   1. Scope to `main` / `#MainContent` — keeps accessibility skip
 *      links and footer anchors out of the candidate set.
 *   2. `:visible` — Dawn renders multiple `<a href="/products/...">`
 *      per card (image, title, full-card overlay); some are zero-size
 *      or covered. Visibility is what `.click()` needs anyway.
 *   3. `:not([href*="gift-card"])` — the dev store sample data has a
 *      gift-card product first in DOM order. Gift cards render as a
 *      denomination form, not a standard add-to-cart button, so any
 *      cart-flow / checkout test that picks `.first()` here would land
 *      on a PDP without `button[name="add"]` and time out. Excluding
 *      it lets the PLP-only specs (view_item_list, select_item) keep
 *      working unchanged while the cart specs hit a real product.
 */
export const PLP_LINK_IN_GRID =
  'main a[href*="/products/"]:visible:not([href*="gift-card"]), #MainContent a[href*="/products/"]:visible:not([href*="gift-card"]), [id*="MainContent"] a[href*="/products/"]:visible:not([href*="gift-card"])';
