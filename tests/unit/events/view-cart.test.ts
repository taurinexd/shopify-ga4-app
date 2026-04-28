import { describe, it, expect } from 'vitest';
import { buildViewCart } from '../../../src/events/view-cart';

const cart = {
  currency: 'EUR',
  total_price: 12890,
  items: [
    { product_id: 'p1', variant_id: 100, title: 'Linen Shirt', variant_title: 'M / Blue', vendor: 'Acme', product_type: 'Apparel', price: 4990, quantity: 1, final_line_price: 4990 },
    { product_id: 'p2', variant_id: 200, title: 'Cotton Pants', variant_title: 'L', vendor: 'Acme', product_type: 'Apparel', price: 7900, quantity: 1, final_line_price: 7900 },
  ],
};

describe('buildViewCart', () => {
  it('builds payload from cart state', () => {
    const p = buildViewCart(cart);
    expect(p!.event).toBe('view_cart');
    expect(p!.ecommerce.value).toBe(128.90);
    expect(p!.ecommerce.items).toHaveLength(2);
    expect(p!.ecommerce.items[0].price).toBe(49.90);
  });

  it('returns null payload-equivalent for empty cart', () => {
    const p = buildViewCart({ currency: 'EUR', total_price: 0, items: [] });
    expect(p).toBeNull();
  });
});
