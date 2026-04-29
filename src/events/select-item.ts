import type { GA4Context } from '../adapters/liquid-context';
import type { GA4EventT } from '../datalayer/schema';
import { optionalItemFields } from '../datalayer/items';

export const LAST_CLICKED_KEY = 'ga4_last_clicked_item';

export function bindSelectItem(ctx: GA4Context, push: (e: GA4EventT) => void): void {
  const c = ctx.page.collection;
  if (!c) return;

  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const link = target?.closest<HTMLAnchorElement>('a[href*="/products/"]');
    if (!link) return;
    const handle = link.pathname.split('/products/')[1]?.split(/[/?#]/)[0];
    if (!handle) return;
    const idx = c.products.findIndex((p) => p.handle === handle);
    if (idx < 0) return;
    const product = c.products[idx];

    const payload: GA4EventT = {
      event: 'select_item',
      ecommerce: {
        currency: ctx.currency,
        item_list_id: c.handle,
        item_list_name: c.title,
        items: [{
          item_id: String(product.id),
          item_name: product.title,
          ...optionalItemFields({ brand: product.vendor, category: product.type }),
          price: product.price,
          quantity: 1,
          index: idx,
        }],
      },
      event_meta: { version: '1.0', source: 'ga4-datalayer-app' },
    };
    push(payload);

    sessionStorage.setItem(LAST_CLICKED_KEY, JSON.stringify({
      handle, index: idx, list_id: c.handle, list_name: c.title, ts: Date.now(),
    }));
  }, { capture: true });
}
