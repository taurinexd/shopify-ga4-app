import type { GA4Context } from '../adapters/liquid-context';
import type { GA4EventT } from '../datalayer/schema';
import { optionalItemFields } from '../datalayer/items';

export function buildViewItem(ctx: GA4Context, variantId: string | null): GA4EventT | null {
  const p = ctx.page.product;
  if (!p) return null;
  const variants = p.variants ?? [];
  const variant = variantId
    ? variants.find((v) => String(v.id) === variantId) ?? variants[0]
    : variants[0];
  if (!variant) return null;
  return {
    event: 'view_item',
    ecommerce: {
      currency: ctx.currency,
      value: variant.price,
      items: [{
        item_id: String(p.id),
        item_name: p.title,
        ...optionalItemFields({
          brand: p.vendor,
          category: p.type,
          variant: variant.title,
        }),
        price: variant.price,
        quantity: 1,
      }],
    },
    event_meta: { version: '1.0', source: 'ga4-datalayer-app' },
  };
}
