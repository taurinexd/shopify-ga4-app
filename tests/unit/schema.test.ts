import { describe, it, expect } from 'vitest';
import { GA4Event, Item, Ecommerce } from '../../src/datalayer/schema';

describe('Item schema', () => {
  it('accepts valid item with required fields', () => {
    const r = Item.safeParse({
      item_id: '8123', item_name: 'Linen Shirt',
      price: 49.90, quantity: 1,
    });
    expect(r.success).toBe(true);
  });

  it('rejects negative price', () => {
    const r = Item.safeParse({
      item_id: '8123', item_name: 'X', price: -1, quantity: 1,
    });
    expect(r.success).toBe(false);
  });

  it('rejects zero/negative quantity', () => {
    const r = Item.safeParse({
      item_id: '8123', item_name: 'X', price: 1, quantity: 0,
    });
    expect(r.success).toBe(false);
  });

  it('rejects empty item_id', () => {
    const r = Item.safeParse({
      item_id: '', item_name: 'X', price: 1, quantity: 1,
    });
    expect(r.success).toBe(false);
  });

  it('accepts optional GA4 fields', () => {
    const r = Item.safeParse({
      item_id: '1', item_name: 'X', price: 1, quantity: 1,
      item_brand: 'B', item_category: 'C', item_category2: 'C2',
      item_variant: 'M', index: 3, discount: 5,
    });
    expect(r.success).toBe(true);
  });
});

describe('Ecommerce schema', () => {
  it('rejects empty items array', () => {
    const r = Ecommerce.safeParse({ items: [] });
    expect(r.success).toBe(false);
  });

  it('accepts currency as 3-letter ISO', () => {
    const r = Ecommerce.safeParse({
      currency: 'EUR',
      items: [{ item_id: '1', item_name: 'X', price: 1, quantity: 1 }],
    });
    expect(r.success).toBe(true);
  });

  it('rejects currency != 3 chars', () => {
    const r = Ecommerce.safeParse({
      currency: 'EU',
      items: [{ item_id: '1', item_name: 'X', price: 1, quantity: 1 }],
    });
    expect(r.success).toBe(false);
  });
});

describe('GA4Event schema', () => {
  it('rejects unknown event names', () => {
    const r = GA4Event.safeParse({
      event: 'unknown_event',
      ecommerce: { items: [{ item_id: '1', item_name: 'X', price: 1, quantity: 1 }] },
    });
    expect(r.success).toBe(false);
  });

  it('accepts all 8 required event names', () => {
    const names = [
      'view_item_list', 'select_item', 'view_item',
      'add_to_cart', 'remove_from_cart', 'view_cart',
      'begin_checkout', 'purchase',
    ];
    for (const name of names) {
      const r = GA4Event.safeParse({
        event: name,
        ecommerce: { items: [{ item_id: '1', item_name: 'X', price: 1, quantity: 1 }] },
      });
      expect(r.success).toBe(true);
    }
  });
});
