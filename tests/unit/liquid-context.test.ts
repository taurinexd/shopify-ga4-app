import { describe, it, expect, beforeEach, vi } from 'vitest';
import { parseContext } from '../../src/adapters/liquid-context';

function setContext(json: string | null) {
  document.body.innerHTML = '';
  if (json !== null) {
    const s = document.createElement('script');
    s.id = 'ga4-context';
    s.type = 'application/json';
    s.textContent = json;
    document.body.appendChild(s);
  }
}

describe('parseContext()', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('returns parsed object for valid JSON', () => {
    setContext('{"gtm_id":"GTM-XYZ","page":{"type":"product"}}');
    const ctx = parseContext();
    expect(ctx).toEqual({ gtm_id: 'GTM-XYZ', page: { type: 'product' } });
  });

  it('returns null when script missing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseContext()).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('returns null + logs error for malformed JSON', () => {
    setContext('{not valid');
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(parseContext()).toBeNull();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it('returns first when multiple scripts present', () => {
    setContext('{"gtm_id":"first"}');
    const second = document.createElement('script');
    second.id = 'ga4-context';
    second.type = 'application/json';
    second.textContent = '{"gtm_id":"second"}';
    document.body.appendChild(second);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseContext()).toEqual({ gtm_id: 'first' });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
