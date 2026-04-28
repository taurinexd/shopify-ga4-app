import { describe, it, expect, vi, beforeEach } from 'vitest';
import { observeVariantChange } from '../../src/adapters/variant-observer';

describe('observeVariantChange', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('fires callback on variant-selects change event', async () => {
    document.body.innerHTML = `
      <variant-selects>
        <input type="radio" name="Size" value="M" checked />
        <input type="radio" name="Size" value="L" />
      </variant-selects>
    `;
    const cb = vi.fn();
    observeVariantChange(cb);
    const el = document.querySelector('variant-selects')!;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 200));
    expect(cb).toHaveBeenCalled();
  });

  it('fires callback on variant-radios change event (test-data theme)', async () => {
    document.body.innerHTML = `
      <variant-radios>
        <input type="radio" name="Color" value="100" checked />
        <input type="radio" name="Color" value="101" />
      </variant-radios>
    `;
    const cb = vi.fn();
    observeVariantChange(cb);
    const el = document.querySelector('variant-radios')!;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 200));
    expect(cb).toHaveBeenCalled();
  });

  it('fallback: fires callback on hidden id input value change via MutationObserver', async () => {
    document.body.innerHTML = `
      <form><input name="id" value="111" /></form>
    `;
    const cb = vi.fn();
    observeVariantChange(cb);
    const input = document.querySelector('input[name="id"]') as HTMLInputElement;
    input.setAttribute('value', '222');
    await new Promise((r) => setTimeout(r, 200));
    expect(cb).toHaveBeenCalled();
  });
});
