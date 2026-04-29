import type { GA4EventT } from '../datalayer/schema';
import { optionalItemFields } from '../datalayer/items';

interface CartState {
  currency?: string;
  total_price: number;
  items: Array<{
    product_id: string | number;
    variant_id: string | number;
    title: string;
    variant_title?: string;
    vendor?: string;
    product_type?: string;
    price: number;
    quantity: number;
    final_line_price?: number;
  }>;
}

export function buildViewCart(cart: CartState): GA4EventT | null {
  if (!cart.items.length) return null;
  return {
    event: 'view_cart',
    ecommerce: {
      currency: cart.currency ?? 'EUR',
      value: cart.total_price / 100,
      items: cart.items.map((line) => {
        const unit = (line.final_line_price ?? line.price * line.quantity) / 100 / line.quantity;
        return {
          item_id: String(line.product_id),
          item_name: line.title,
          ...optionalItemFields({
            brand: line.vendor,
            category: line.product_type,
            variant: line.variant_title,
          }),
          price: unit,
          quantity: line.quantity,
        };
      }),
    },
    event_meta: { version: '1.0', source: 'ga4-datalayer-app' },
  };
}
