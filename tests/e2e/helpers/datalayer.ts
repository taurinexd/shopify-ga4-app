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
