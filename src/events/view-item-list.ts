import type { GA4Context } from '../adapters/liquid-context';
import type { GA4EventT } from '../datalayer/schema';
import { optionalItemFields } from '../datalayer/items';

export function buildViewItemList(ctx: GA4Context): GA4EventT | null {
  const c = ctx.page.collection;
  if (!c) return null;
  return {
    event: 'view_item_list',
    ecommerce: {
      currency: ctx.currency,
      item_list_id: c.handle,
      item_list_name: c.title,
      items: c.products.map((p, idx) => ({
        item_id: String(p.id),
        item_name: p.title,
        ...optionalItemFields({ brand: p.vendor, category: p.type }),
        price: p.price,
        quantity: 1,
        index: idx,
      })),
    },
    event_meta: { version: '1.0', source: 'ga4-datalayer-app' },
  };
}

export function emitViewItemList(ctx: GA4Context, push: (e: GA4EventT) => void): void {
  const payload = buildViewItemList(ctx);
  if (payload) push(payload);
}
