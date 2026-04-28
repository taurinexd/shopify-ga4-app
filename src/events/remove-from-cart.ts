import type { GA4EventT } from '../datalayer/schema';
import { hasPendingUserAction } from '../adapters/cart-api';

interface CartLine {
  variant_id: string | number;
  product_id: string | number;
  title: string;
  variant_title?: string;
  vendor?: string;
  product_type?: string;
  price: number;
  quantity: number;
  final_line_price?: number;
}
interface CartState { items: CartLine[]; currency?: string; }

export function handleCartChange(
  previous: CartState | null,
  current: CartState,
  push: (e: GA4EventT) => void,
): void {
  if (!previous) return;
  for (const prevLine of previous.items) {
    const curLine = current.items.find((c) => c.variant_id === prevLine.variant_id);
    const removedQty = curLine ? prevLine.quantity - curLine.quantity : prevLine.quantity;
    if (removedQty <= 0) continue;
    if (!hasPendingUserAction(String(prevLine.variant_id), true)) continue;
    const unit = (prevLine.final_line_price ?? prevLine.price * prevLine.quantity) / 100 / prevLine.quantity;
    push({
      event: 'remove_from_cart',
      ecommerce: {
        currency: current.currency ?? 'EUR',
        value: unit * removedQty,
        items: [{
          item_id: String(prevLine.product_id),
          item_name: prevLine.title,
          item_brand: prevLine.vendor,
          item_category: prevLine.product_type,
          item_variant: prevLine.variant_title,
          price: unit,
          quantity: removedQty,
        }],
      },
      event_meta: { version: '1.0', source: 'ga4-datalayer-app' },
    });
  }
}
