import { initDataLayer, safePush, setDebugMode } from './datalayer/core';
import { parseContext } from './adapters/liquid-context';
import { ensureClientId, persistToCart } from './adapters/client-id';
import { applyConsentDefaults } from './datalayer/consent';
import { installCartInterceptor } from './adapters/cart-api';
import { observeVariantChange } from './adapters/variant-observer';
import { emitViewItemList } from './events/view-item-list';
import { bindSelectItem } from './events/select-item';
import { buildViewItem } from './events/view-item';
import { buildAddToCart } from './events/add-to-cart';
import { handleCartChange } from './events/remove-from-cart';
import { buildViewCart } from './events/view-cart';
import { initOverlay } from './debug/overlay';

function injectGTM(gtmId: string, clientId: string): void {
  if (!gtmId) return;
  window.dataLayer.push({ ga4_client_id: clientId });
  const gtm = document.createElement('script');
  gtm.async = true;
  gtm.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtmId)}`;
  document.head.appendChild(gtm);
  window.dataLayer.push({
    'gtm.start': Date.now(),
    event: 'gtm.js',
  });
}

async function bootstrap(): Promise<void> {
  initDataLayer();
  const ctx = parseContext();
  if (!ctx) return;

  if (location.search.includes('ga4_debug')) {
    try { sessionStorage.setItem('ga4_debug', '1'); } catch {}
  }
  const debug = sessionStorage.getItem('ga4_debug') === '1';
  if (debug) setDebugMode(true);

  applyConsentDefaults();
  const clientId = ensureClientId();
  void persistToCart(clientId);
  injectGTM(ctx.gtm_id, clientId);

  let previousCart: any = null;
  installCartInterceptor({
    onAddToCart: (resp) => safePush(buildAddToCart(resp as any)),
    onCartChange: (resp) => {
      handleCartChange(previousCart, resp as any, safePush);
      previousCart = resp;
    },
    onCartView: (cart) => {
      previousCart = cart;
    },
  });

  switch (ctx.page.type) {
    case 'collection':
      emitViewItemList(ctx, safePush);
      bindSelectItem(ctx, safePush);
      break;
    case 'product': {
      const initial = buildViewItem(ctx, null);
      if (initial) safePush(initial);
      observeVariantChange((variantId) => {
        const updated = buildViewItem(ctx, variantId);
        if (updated) safePush(updated);
      });
      break;
    }
    case 'cart': {
      const cart = await fetch('/cart.js').then((r) => r.json());
      previousCart = cart;
      const payload = buildViewCart(cart);
      if (payload) safePush(payload);
      break;
    }
  }

  if (debug) initOverlay();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void bootstrap());
} else {
  void bootstrap();
}
