export interface GA4Context {
  gtm_id: string;
  currency?: string;
  shop?: string;
  page: {
    type: string;
    product?: {
      id: string | number;
      title: string;
      vendor?: string;
      type?: string;
      tags?: string[];
      variants?: Array<{ id: number; title: string; price: number; sku?: string }>;
    };
    collection?: {
      id: string | number;
      handle: string;
      title: string;
      products: Array<{
        id: string | number;
        handle: string;
        title: string;
        vendor?: string;
        type?: string;
        price: number;
      }>;
    };
  };
}

export function parseContext(): GA4Context | null {
  const nodes = document.querySelectorAll('script#ga4-context');
  if (nodes.length === 0) {
    // eslint-disable-next-line no-console
    console.warn('[ga4-datalayer] missing context script — block embed not active?');
    return null;
  }
  if (nodes.length > 1) {
    // eslint-disable-next-line no-console
    console.warn('[ga4-datalayer] multiple ga4-context found, using first');
  }
  try {
    return JSON.parse((nodes[0] as HTMLScriptElement).textContent ?? '');
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[ga4-datalayer] malformed context JSON', e);
    return null;
  }
}
