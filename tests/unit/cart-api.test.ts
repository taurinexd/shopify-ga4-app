import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  installCartInterceptor, addPendingUserAction,
  hasPendingUserAction, FETCH_SENTINEL,
} from '../../src/adapters/cart-api';

describe('cart-api interceptor', () => {
  beforeEach(() => {
    (window as any).fetch = vi.fn(async () =>
      new Response(JSON.stringify({ items: [] }), { status: 200 })
    );
  });

  it('marks fetch with sentinel after install', () => {
    installCartInterceptor();
    expect((window.fetch as any)[FETCH_SENTINEL]).toBeDefined();
  });

  it('calls onAddToCart when /cart/add.js intercepted', async () => {
    const onAdd = vi.fn();
    installCartInterceptor({ onAddToCart: onAdd });
    (window.fetch as any).mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 1, product_id: 'p1', quantity: 1 }), { status: 200 })
    );
    await window.fetch('/cart/add.js', { method: 'POST' });
    expect(onAdd).toHaveBeenCalled();
  });

  it('calls onChange when /cart/change.js intercepted', async () => {
    const onChange = vi.fn();
    installCartInterceptor({ onCartChange: onChange });
    (window.fetch as any).mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [], total_price: 0 }), { status: 200 })
    );
    await window.fetch('/cart/change.js', { method: 'POST' });
    expect(onChange).toHaveBeenCalled();
  });
});

describe('pendingUserActions', () => {
  it('tracks variant ids added/consumed', () => {
    addPendingUserAction('v123');
    expect(hasPendingUserAction('v123', true)).toBe(true);
    expect(hasPendingUserAction('v123', false)).toBe(false);
  });
});
