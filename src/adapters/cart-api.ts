export const FETCH_SENTINEL = Symbol.for('ga4-fetch-patched');
export const XHR_SENTINEL = Symbol.for('ga4-xhr-patched');
const REPATCH_BUDGET = 3;

export interface CartInterceptorHooks {
  onAddToCart?: (responseBody: unknown) => void;
  onCartChange?: (responseBody: unknown) => void;
  onCartView?: (cart: unknown) => void;
}

const pendingUserActions = new Set<string>();
let recentRemoveClickTs = 0;
const REMOVE_FALLBACK_WINDOW_MS = 3000;
export function addPendingUserAction(variantId: string): void {
  pendingUserActions.add(variantId);
}
export function markRemoveClick(): void {
  recentRemoveClickTs = Date.now();
}
export function hasPendingUserAction(variantId: string, consume: boolean): boolean {
  if (pendingUserActions.has(variantId)) {
    if (consume) pendingUserActions.delete(variantId);
    return true;
  }
  if (Date.now() - recentRemoveClickTs < REMOVE_FALLBACK_WINDOW_MS) {
    if (consume) recentRemoveClickTs = 0;
    return true;
  }
  return false;
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return (input as Request).url;
}

function applyFetchPatch(target: typeof fetch, hooks: CartInterceptorHooks, depth = 0): typeof fetch {
  if (depth > REPATCH_BUDGET) {
    // eslint-disable-next-line no-console
    console.error('[ga4-datalayer] fetch repatch budget exhausted');
    return target;
  }
  const sentinelDepth = depth + 1;
  // Use a Proxy so any properties on the underlying fetch (e.g. vi.fn mock
  // helpers like .mockResolvedValueOnce, or custom props set by 3rd-party
  // libs) remain reachable through the wrapper.
  const wrapped = new Proxy(target, {
    apply: async (fnTarget, thisArg, args: [RequestInfo | URL, RequestInit?]) => {
      const response = await Reflect.apply(fnTarget, thisArg, args);
      const url = urlOf(args[0]);
      try {
        if (url.includes('/cart/add')) {
          const body = await response.clone().json();
          hooks.onAddToCart?.(body);
        } else if (url.includes('/cart/change') || url.includes('/cart/update')) {
          const body = await response.clone().json();
          hooks.onCartChange?.(body);
        } else if (url.endsWith('/cart.js')) {
          const body = await response.clone().json();
          hooks.onCartView?.(body);
        }
      } catch {
        // body not JSON or already consumed — ignore
      }
      return response;
    },
    get: (fnTarget, prop, receiver) => {
      if (prop === FETCH_SENTINEL) return sentinelDepth;
      return Reflect.get(fnTarget, prop, receiver);
    },
    has: (fnTarget, prop) => {
      if (prop === FETCH_SENTINEL) return true;
      return Reflect.has(fnTarget, prop);
    },
  }) as typeof fetch;
  return wrapped;
}

export function installCartInterceptor(hooks: CartInterceptorHooks = {}): void {
  window.fetch = applyFetchPatch(window.fetch, hooks);

  const reapply = () => {
    if (!(window.fetch as any)[FETCH_SENTINEL]) {
      // eslint-disable-next-line no-console
      console.warn('[ga4-datalayer] fetch repatched by 3rd party — re-applying');
      window.fetch = applyFetchPatch(window.fetch, hooks);
    }
  };
  ['click', 'submit'].forEach((evt) =>
    document.addEventListener(evt, reapply, { capture: true, passive: true })
  );

  installXHRInterceptor(hooks);
  installUserActionDelegate();
}

function installXHRInterceptor(hooks: CartInterceptorHooks): void {
  const proto = XMLHttpRequest.prototype as any;
  if (proto[XHR_SENTINEL]) return;
  const origOpen = proto.open;
  const origSend = proto.send;
  proto.open = function (method: string, url: string, ...rest: unknown[]) {
    (this as any).__ga4Url = url;
    return origOpen.call(this, method, url, ...rest);
  };
  proto.send = function (body?: unknown) {
    this.addEventListener('load', () => {
      const url: string = (this as any).__ga4Url;
      if (!url) return;
      try {
        const parsed = JSON.parse(this.responseText);
        if (url.includes('/cart/add')) hooks.onAddToCart?.(parsed);
        else if (url.includes('/cart/change') || url.includes('/cart/update')) hooks.onCartChange?.(parsed);
        else if (url.endsWith('/cart.js')) hooks.onCartView?.(parsed);
      } catch {
        // ignore non-JSON
      }
    });
    return origSend.call(this, body);
  };
  proto[XHR_SENTINEL] = true;
}

function installUserActionDelegate(): void {
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement | null;
    const removeBtn = target?.closest<HTMLElement>(
      '[data-cart-remove], a[href*="quantity=0"], button[name="remove"], cart-remove-button a'
    );
    if (!removeBtn) return;
    markRemoveClick();
    const variantId = removeBtn.dataset.variantId
      || removeBtn.closest<HTMLElement>('[data-variant-id]')?.dataset.variantId;
    if (variantId) addPendingUserAction(variantId);
  }, { capture: true });
}
