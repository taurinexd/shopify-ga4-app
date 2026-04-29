import type { GA4EventT } from '../datalayer/schema';
import { LAST_CLICKED_KEY } from './select-item';
import { optionalItemFields } from '../datalayer/items';

interface CartAddResponse {
  product_id: string | number;
  variant_id?: string | number;
  title: string;
  variant_title?: string;
  vendor?: string;
  product_type?: string;
  price: number;
  quantity: number;
  final_line_price?: number;
  currency?: string;
}

export function buildAddToCart(resp: CartAddResponse): GA4EventT {
  const price = (resp.final_line_price ?? resp.price * resp.quantity) / 100 / resp.quantity;
  const value = price * resp.quantity;

  let listAttr: { list_id?: string; list_name?: string; index?: number } = {};
  try {
    const stored = sessionStorage.getItem(LAST_CLICKED_KEY);
    if (stored) {
      const o = JSON.parse(stored);
      if (Date.now() - o.ts < 1000 * 60 * 30) {
        listAttr = { list_id: o.list_id, list_name: o.list_name, index: o.index };
      }
    }
  } catch { /* ignore */ }

  return {
    event: 'add_to_cart',
    ecommerce: {
      currency: resp.currency ?? 'EUR',
      value,
      ...(listAttr.list_id ? { item_list_id: listAttr.list_id, item_list_name: listAttr.list_name } : {}),
      items: [{
        item_id: String(resp.product_id),
        item_name: resp.title,
        ...optionalItemFields({
          brand: resp.vendor,
          category: resp.product_type,
          variant: resp.variant_title,
        }),
        price,
        quantity: resp.quantity,
        ...(listAttr.index !== undefined ? { index: listAttr.index } : {}),
      }],
    },
    event_meta: { version: '1.0', source: 'ga4-datalayer-app' },
  };
}
