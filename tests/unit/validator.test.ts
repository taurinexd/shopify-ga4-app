import { describe, it, expect, beforeEach } from 'vitest';
import { validate } from '../../src/datalayer/validator';
import { safePush, initDataLayer } from '../../src/datalayer/core';

describe('validate()', () => {
  it('returns ok=true for valid event', () => {
    const r = validate({
      event: 'view_item',
      ecommerce: { items: [{ item_id: '1', item_name: 'X', price: 1, quantity: 1 }] },
    });
    expect(r.ok).toBe(true);
  });

  it('returns errors for invalid event', () => {
    const r = validate({ event: 'foo', ecommerce: { items: [] } });
    expect(r.ok).toBe(false);
    expect(r.errors).toBeDefined();
    expect(r.errors!.length).toBeGreaterThan(0);
  });
});

describe('safePush()', () => {
  beforeEach(() => {
    (globalThis as any).window = {
      dataLayer: [], dataLayer_debug: [],
    };
    initDataLayer();
  });

  it('pushes valid event to dataLayer', () => {
    safePush({
      event: 'view_item',
      ecommerce: { items: [{ item_id: '1', item_name: 'X', price: 1, quantity: 1 }] },
    });
    expect((window as any).dataLayer).toHaveLength(1);
    expect((window as any).dataLayer_debug).toHaveLength(0);
  });

  it('drops invalid event from main, pushes to debug channel', () => {
    safePush({ event: 'invalid', ecommerce: { items: [] } });
    expect((window as any).dataLayer).toHaveLength(0);
    expect((window as any).dataLayer_debug).toHaveLength(1);
    expect((window as any).dataLayer_debug[0]).toHaveProperty('errors');
    expect((window as any).dataLayer_debug[0]).toHaveProperty('payload');
  });
});

describe('initDataLayer()', () => {
  it('initializes dataLayer literal as required by GA4', () => {
    delete (globalThis as any).window.dataLayer;
    initDataLayer();
    expect((window as any).dataLayer).toEqual([]);
  });

  it('preserves existing dataLayer entries', () => {
    (window as any).dataLayer = [{ existing: true }];
    initDataLayer();
    expect((window as any).dataLayer).toEqual([{ existing: true }]);
  });
});
