export const CID_KEY = 'ga4_cid';

function uuidv4(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function ensureClientId(): string {
  const existing = localStorage.getItem(CID_KEY);
  if (existing) return existing;
  const id = uuidv4();
  localStorage.setItem(CID_KEY, id);
  return id;
}

export async function persistToCart(clientId: string): Promise<void> {
  try {
    const cart = await fetch('/cart.js').then((r) => r.json());
    if (cart.attributes && cart.attributes.ga4_cid === clientId) return;
    await fetch('/cart/update.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attributes: { ga4_cid: clientId } }),
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[ga4-datalayer] failed to persist client_id to cart', e);
  }
}
