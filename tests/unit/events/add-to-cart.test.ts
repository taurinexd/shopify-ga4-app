import { describe, it, expect, beforeEach } from 'vitest';
import { buildAddToCart } from '../../../src/events/add-to-cart';
import { LAST_CLICKED_KEY } from '../../../src/events/select-item';
import addResp from '../../fixtures/cart-add-response.json';

describe('buildAddToCart', () => {
  beforeEach(() => sessionStorage.clear());

  it('builds payload from /cart/add.js response', () => {
    const p = buildAddToCart(addResp);
    expect(p.event).toBe('add_to_cart');
    expect(p.ecommerce.currency).toBe('EUR');
    expect(p.ecommerce.value).toBe(49.90);
    expect(p.ecommerce.items[0]).toMatchObject({
      item_id: '8123456789',
      item_name: 'Linen Shirt',
      item_brand: 'Acme',
      item_category: 'Apparel',
      item_variant: 'M / Blue',
      price: 49.90,
      quantity: 1,
    });
  });

  it('propagates list attribution from sessionStorage', () => {
    sessionStorage.setItem(LAST_CLICKED_KEY, JSON.stringify({
      handle: 'linen-shirt', index: 3, list_id: 'summer', list_name: 'Summer', ts: Date.now(),
    }));
    const p = buildAddToCart(addResp);
    expect(p.ecommerce.item_list_id).toBe('summer');
    expect(p.ecommerce.item_list_name).toBe('Summer');
    expect(p.ecommerce.items[0].index).toBe(3);
  });
});
