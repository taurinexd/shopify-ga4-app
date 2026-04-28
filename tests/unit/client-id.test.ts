import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ensureClientId, persistToCart, CID_KEY } from '../../src/adapters/client-id';

describe('ensureClientId()', () => {
  beforeEach(() => localStorage.clear());

  it('generates and persists a UUIDv4 if missing', () => {
    const id = ensureClientId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(localStorage.getItem(CID_KEY)).toBe(id);
  });

  it('returns existing client_id from localStorage', () => {
    localStorage.setItem(CID_KEY, 'existing-id');
    expect(ensureClientId()).toBe('existing-id');
  });
});

describe('persistToCart()', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn(async (url: string) => {
      if (url === '/cart.js') {
        return new Response(JSON.stringify({ attributes: {} }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    (globalThis as any).fetch = fetchMock;
  });
  afterEach(() => { delete (globalThis as any).fetch; });

  it('POSTs to /cart/update.js when attribute missing', async () => {
    await persistToCart('cid-123');
    const calls = fetchMock.mock.calls;
    expect(calls.some(([u]) => u === '/cart.js')).toBe(true);
    expect(calls.some(([u, init]) =>
      u === '/cart/update.js' &&
      init?.method === 'POST' &&
      JSON.parse(init.body as string).attributes.ga4_cid === 'cid-123'
    )).toBe(true);
  });

  it('skips POST when ga4_cid already in cart attributes', async () => {
    fetchMock.mockImplementationOnce(async () =>
      new Response(JSON.stringify({ attributes: { ga4_cid: 'cid-123' } }), { status: 200 })
    );
    await persistToCart('cid-123');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
