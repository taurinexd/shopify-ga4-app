import { describe, it, expect } from 'vitest';
import { buildViewItem } from '../../../src/events/view-item';
import productCtx from '../../fixtures/product-context.json';

describe('buildViewItem', () => {
  it('builds payload for first variant by default', () => {
    const p = buildViewItem(productCtx as any, null);
    expect(p!.event).toBe('view_item');
    expect(p!.ecommerce.currency).toBe('EUR');
    expect(p!.ecommerce.value).toBe(49.90);
    expect(p!.ecommerce.items[0].item_variant).toBe('M / Blue');
  });

  it('builds payload for selected variant', () => {
    const p = buildViewItem(productCtx as any, '101');
    expect(p!.ecommerce.items[0].item_variant).toBe('L / Blue');
  });

  it('returns null if not a product page', () => {
    expect(buildViewItem({ page: { type: 'collection' } } as any, null)).toBeNull();
  });
});
