import { describe, it, expect } from 'vitest';
import { buildViewItemList } from '../../../src/events/view-item-list';
import collectionCtx from '../../fixtures/collection-context.json';

describe('buildViewItemList', () => {
  it('builds GA4 payload with item_list_id, item_list_name, indexed items', () => {
    const payload = buildViewItemList(collectionCtx as any);
    expect(payload).not.toBeNull();
    expect(payload!.event).toBe('view_item_list');
    expect(payload!.ecommerce.item_list_id).toBe('summer-collection');
    expect(payload!.ecommerce.item_list_name).toBe('Summer Collection');
    expect(payload!.ecommerce.items).toHaveLength(2);
    expect(payload!.ecommerce.items[0]).toMatchObject({
      item_id: '8123456789',
      item_name: 'Linen Shirt',
      item_brand: 'Acme',
      item_category: 'Apparel',
      price: 49.90,
      quantity: 1,
      index: 0,
    });
    expect(payload!.ecommerce.items[1].index).toBe(1);
  });

  it('returns null if no collection in context', () => {
    expect(buildViewItemList({ gtm_id: '', page: { type: 'product' } } as any)).toBeNull();
  });
});
