import { describe, it, expect, beforeEach, vi } from 'vitest';
import { bindSelectItem, LAST_CLICKED_KEY } from '../../../src/events/select-item';
import collectionCtx from '../../fixtures/collection-context.json';

describe('bindSelectItem', () => {
  beforeEach(() => { document.body.innerHTML = ''; sessionStorage.clear(); });

  it('emits select_item on product link click and stores last_clicked for attribution', () => {
    document.body.innerHTML = `
      <div>
        <a href="/products/linen-shirt" data-index="0">Linen Shirt</a>
        <a href="/products/cotton-pants" data-index="1">Cotton Pants</a>
      </div>`;
    const push = vi.fn();
    bindSelectItem(collectionCtx as any, push);
    (document.querySelector('a[href="/products/cotton-pants"]') as HTMLElement).click();
    expect(push).toHaveBeenCalled();
    const arg = push.mock.calls[0][0];
    expect(arg.event).toBe('select_item');
    expect(arg.ecommerce.items[0].item_id).toBe('8123456790');
    expect(arg.ecommerce.items[0].index).toBe(1);
    const stored = JSON.parse(sessionStorage.getItem(LAST_CLICKED_KEY)!);
    expect(stored.handle).toBe('cotton-pants');
    expect(stored.index).toBe(1);
  });
});
