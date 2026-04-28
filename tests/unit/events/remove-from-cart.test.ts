import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleCartChange } from '../../../src/events/remove-from-cart';
import { addPendingUserAction } from '../../../src/adapters/cart-api';

const previousCart = {
  items: [{ variant_id: 100, product_id: 'p1', title: 'X', variant_title: 'M', vendor: 'A', product_type: 'C', price: 4990, quantity: 2, final_line_price: 9980 }],
  currency: 'EUR',
};
const updatedCart = {
  items: [{ variant_id: 100, product_id: 'p1', title: 'X', variant_title: 'M', vendor: 'A', product_type: 'C', price: 4990, quantity: 1, final_line_price: 4990 }],
  currency: 'EUR',
};

describe('handleCartChange', () => {
  beforeEach(() => vi.clearAllMocks());

  it('emits remove_from_cart only when variant in pendingUserActions', () => {
    addPendingUserAction('100');
    const push = vi.fn();
    handleCartChange(previousCart, updatedCart, push);
    expect(push).toHaveBeenCalled();
    expect(push.mock.calls[0][0].event).toBe('remove_from_cart');
    expect(push.mock.calls[0][0].ecommerce.items[0].quantity).toBe(1);
  });

  it('does NOT emit when not user-initiated (no pending action)', () => {
    const push = vi.fn();
    handleCartChange(previousCart, updatedCart, push);
    expect(push).not.toHaveBeenCalled();
  });
});
