const STYLES = `
:host {
  position: fixed !important;
  bottom: 12px !important;
  right: 12px !important;
  width: 420px !important;
  max-height: 60vh !important;
  z-index: 2147483647 !important;
  display: block !important;
  font-family: system-ui, sans-serif;
  contain: layout style;
  transition: width 180ms ease, max-height 180ms ease;
}
:host(.collapsed) {
  width: 56px !important;
  max-height: 56px !important;
}
:host(.collapsed) .root { display: none; }
.collapsed-pill {
  display: none;
  width: 56px; height: 56px;
  background: #111; color: #4ade80;
  border-radius: 50%;
  align-items: center; justify-content: center;
  font-weight: 700; font-size: 13px;
  cursor: pointer;
  box-shadow: 0 4px 24px rgba(0,0,0,.3);
  border: 2px solid #222;
  user-select: none;
  letter-spacing: 0.3px;
}
.collapsed-pill:hover { background: #1a1a1a; }
:host(.collapsed) .collapsed-pill { display: flex; }
.root {
  width: 100%;
  max-height: 60vh;
  overflow: auto;
  background: #111; color: #f0f0f0;
  border-radius: 8px; box-shadow: 0 4px 24px rgba(0,0,0,.3);
  font-size: 12px;
}
.header {
  padding: 8px 12px; background: #222;
  display: flex; gap: 8px; align-items: center; justify-content: space-between;
  position: sticky; top: 0;
}
.header strong { color: #4ade80; }
.empty-state {
  padding: 32px 16px;
  text-align: center;
  color: #888;
  font-size: 12px;
  line-height: 1.5;
}
.empty-state .icon {
  display: block;
  font-size: 28px;
  margin-bottom: 10px;
  opacity: 0.4;
}
.empty-state .hint {
  display: block;
  margin-top: 8px;
  font-size: 10px;
  color: #555;
}
@keyframes ga4-slide-in {
  from { opacity: 0; transform: translateX(8px); }
  to { opacity: 1; transform: translateX(0); }
}
.row { padding: 6px 12px; border-bottom: 1px solid #333; cursor: pointer; }
.row.invalid { background: #5b1d1d; }
.row.is-new { animation: ga4-slide-in 200ms ease-out; }
.row .name { font-weight: 600; }
.row .ts { color: #888; font-size: 10px; margin-left: 6px; }
pre { white-space: pre-wrap; word-break: break-all; font-size: 11px; padding: 8px 12px; background: #0a0a0a; margin: 0; }
.json-key { color: #93c5fd; }
.json-str { color: #fca5a5; }
.json-num { color: #fcd34d; }
.json-bool { color: #c4b5fd; }
.json-null { color: #c4b5fd; font-style: italic; }
button { background: #333; color: #f0f0f0; border: 0; padding: 4px 8px; border-radius: 4px; cursor: pointer; }
button:hover { background: #444; }
`;

const HTML_ESC: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
};
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESC[c]);
}

const JSON_TOKEN =
  /"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\b(?:true|false|null)\b|[{}[\],:]|\s+/g;

/**
 * Tokenise JSON.stringify output and wrap each token in a span with a
 * semantic class so the overlay payload can be syntax-highlighted via
 * shadow CSS. Tokens are HTML-escaped before concatenation; XSS-safe even
 * if a Liquid attribute leaks markup into the dataLayer.
 */
function highlightJson(value: unknown): string {
  let json: string;
  try {
    json = JSON.stringify(value, null, 2);
  } catch {
    return escapeHtml(String(value));
  }
  if (json === undefined) return '';
  let out = '';
  let last = 0;
  let m: RegExpExecArray | null;
  JSON_TOKEN.lastIndex = 0;
  while ((m = JSON_TOKEN.exec(json)) !== null) {
    if (m.index > last) out += escapeHtml(json.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('"')) {
      const after = json.slice(m.index + tok.length);
      const cls = /^\s*:/.test(after) ? 'json-key' : 'json-str';
      out += `<span class="${cls}">${escapeHtml(tok)}</span>`;
    } else if (/^[-\d]/.test(tok)) {
      out += `<span class="json-num">${escapeHtml(tok)}</span>`;
    } else if (tok === 'true' || tok === 'false') {
      out += `<span class="json-bool">${tok}</span>`;
    } else if (tok === 'null') {
      out += `<span class="json-null">${tok}</span>`;
    } else {
      out += escapeHtml(tok);
    }
    last = m.index + tok.length;
  }
  if (last < json.length) out += escapeHtml(json.slice(last));
  return out;
}

const FRESH_WINDOW_MS = 600;

export function initOverlay(): void {
  if (document.getElementById('ga4-debug-overlay')) return;
  const host = document.createElement('div');
  host.id = 'ga4-debug-overlay';
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = STYLES;
  shadow.appendChild(style);

  const collapsedPill = document.createElement('div');
  collapsedPill.className = 'collapsed-pill';
  collapsedPill.title = 'Click to expand GA4 debug overlay';
  collapsedPill.textContent = 'DL';
  shadow.appendChild(collapsedPill);

  const root = document.createElement('div');
  root.className = 'root';
  shadow.appendChild(root);
  const header = document.createElement('div');
  header.className = 'header';
  header.innerHTML = `<strong>GA4 DataLayer Debug</strong> <span id="count">0</span>
    <span style="flex:1"></span>
    <button id="filter" title="Cycle filter (GA / GTM / All)">GA</button>
    <button id="copy">Copy</button>
    <button id="clear">Clear</button>
    <button id="collapse" title="Collapse to pill">−</button>`;
  root.appendChild(header);
  const list = document.createElement('div');
  list.id = 'list';
  root.appendChild(list);

  const STORAGE_KEY = 'ga4_debug_events';
  const FILTER_KEY = 'ga4_debug_filter';
  const COLLAPSED_KEY = 'ga4_debug_collapsed';
  try {
    if (sessionStorage.getItem(COLLAPSED_KEY) === '1') host.classList.add('collapsed');
  } catch { /* sessionStorage may be blocked in private mode */ }
  type FilterMode = 'ga' | 'gtm' | 'all';
  const FILTER_ORDER: FilterMode[] = ['ga', 'gtm', 'all'];
  const FILTER_LABEL: Record<FilterMode, string> = { ga: 'GA', gtm: 'GTM', all: 'All' };
  const FILTER_TITLE: Record<FilterMode, string> = {
    ga: 'Showing GA4 events only — click to cycle (GA → GTM → All)',
    gtm: 'Showing GTM internal events only — click to cycle (GTM → All → GA)',
    all: 'Showing all events — click to cycle (All → GA → GTM)',
  };
  let filterMode: FilterMode = (() => {
    try {
      const stored = sessionStorage.getItem(FILTER_KEY);
      return (stored === 'ga' || stored === 'gtm' || stored === 'all') ? stored : 'ga';
    } catch { return 'ga'; }
  })();
  const events: Array<{ payload: unknown; valid: boolean; ts: number }> = (() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  })();

  function persist(): void {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(events.slice(-200)));
    } catch {}
  }

  // Internal "noise" payloads we always hide regardless of filter mode:
  // - `gtag('consent', ...)` calls land in dataLayer as a 3-element array,
  //   not as `{event: ...}` — never user-meaningful.
  // - The single-key `{ga4_client_id: ...}` we push at boot to expose the
  //   cid to GTM tags is a marker, not a tracked event.
  function isInternalNoise(p: unknown): boolean {
    if (Array.isArray(p) && p[0] === 'consent') return true;
    if (typeof p === 'object' && p !== null) {
      const o = p as Record<string, unknown>;
      if (typeof o.ga4_client_id === 'string' && Object.keys(o).length === 1) return true;
    }
    return false;
  }

  // Brief-canonical GA4 event names (the 8 the spec mandates). Includes
  // both valid and validation-failed pushes — a dropped `view_item` is
  // still a GA4-intent event the developer wants to see in GA mode.
  const GA_EVENT_NAMES = new Set([
    'view_item_list', 'select_item', 'view_item',
    'add_to_cart', 'remove_from_cart', 'view_cart',
    'begin_checkout', 'purchase',
  ]);

  function isGaEvent(p: unknown): boolean {
    if (typeof p !== 'object' || p === null) return false;
    const name = (p as Record<string, unknown>).event;
    return typeof name === 'string' && GA_EVENT_NAMES.has(name);
  }

  function isGtmEvent(p: unknown): boolean {
    if (typeof p !== 'object' || p === null) return false;
    const name = (p as Record<string, unknown>).event;
    return typeof name === 'string' && name.startsWith('gtm.');
  }

  function isVisible(p: unknown): boolean {
    if (isInternalNoise(p)) return false;
    if (filterMode === 'ga') return isGaEvent(p);
    if (filterMode === 'gtm') return isGtmEvent(p);
    return true;
  }

  function updateFilterButton(): void {
    const btn = shadow.getElementById('filter') as HTMLButtonElement | null;
    if (!btn) return;
    btn.textContent = FILTER_LABEL[filterMode];
    btn.title = FILTER_TITLE[filterMode];
  }

  function renderEmptyState(): void {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    const filterHint =
      filterMode === 'ga'
        ? 'Open a collection or product page to see GA4 events.'
        : filterMode === 'gtm'
          ? 'No GTM lifecycle events captured yet.'
          : 'Waiting for any dataLayer push.';
    empty.innerHTML = `<span class="icon">◌</span>
      Waiting for events…
      <span class="hint">${filterHint}</span>`;
    list.appendChild(empty);
  }

  function render(): void {
    list.innerHTML = '';
    const visible = events.filter((e) => isVisible(e.payload));
    if (visible.length === 0) {
      renderEmptyState();
    } else {
      const now = Date.now();
      visible.slice().reverse().forEach((e) => {
        const row = document.createElement('div');
        const isNew = now - e.ts < FRESH_WINDOW_MS;
        row.className = `row ${e.valid ? '' : 'invalid'} ${isNew ? 'is-new' : ''}`.trim();
        const name = (e.payload as { event?: unknown })?.event ?? '<unknown>';
        const safeName = escapeHtml(String(name));
        row.innerHTML = `<span class="name">${e.valid ? '✓' : '✗'} ${safeName}</span>
          <span class="ts">${new Date(e.ts).toLocaleTimeString()}</span>`;
        const pre = document.createElement('pre');
        pre.style.display = 'none';
        pre.innerHTML = highlightJson(e.payload);
        row.appendChild(pre);
        row.addEventListener('click', () => {
          pre.style.display = pre.style.display === 'none' ? 'block' : 'none';
        });
        list.appendChild(row);
      });
    }
    (shadow.getElementById('count') as HTMLElement).textContent = String(visible.length);
    collapsedPill.textContent = visible.length > 99 ? '99+' : String(visible.length);
  }

  shadow.getElementById('filter')!.addEventListener('click', () => {
    const next = (FILTER_ORDER.indexOf(filterMode) + 1) % FILTER_ORDER.length;
    filterMode = FILTER_ORDER[next];
    try { sessionStorage.setItem(FILTER_KEY, filterMode); } catch {}
    updateFilterButton();
    render();
  });
  shadow.getElementById('copy')!.addEventListener('click', () => {
    // Copy respects the current filter — if the user is hiding GTM noise,
    // pasting into a ticket shouldn't include it either.
    const visible = events.filter((e) => isVisible(e.payload));
    navigator.clipboard.writeText(JSON.stringify(visible, null, 2));
  });
  shadow.getElementById('clear')!.addEventListener('click', () => {
    // Clear also respects the filter — removes only the events currently
    // shown so the user can prune GTM chatter without losing the GA4
    // events captured so far (or vice-versa).
    const keepers = events.filter((e) => !isVisible(e.payload));
    events.length = 0;
    events.push(...keepers);
    persist();
    render();
  });
  function setCollapsed(next: boolean): void {
    host.classList.toggle('collapsed', next);
    try { sessionStorage.setItem(COLLAPSED_KEY, next ? '1' : '0'); } catch { /* ignore */ }
  }
  shadow.getElementById('collapse')!.addEventListener('click', () => setCollapsed(true));
  collapsedPill.addEventListener('click', () => setCollapsed(false));
  updateFilterButton();

  const w = window as any;
  w.dataLayer = w.dataLayer || [];
  w.dataLayer_debug = w.dataLayer_debug || [];

  const seenTs = new Set(events.map((e) => e.ts));
  const now = Date.now();
  (w.dataLayer as unknown[]).forEach((p, i) => {
    const ts = now - (w.dataLayer.length - i);
    if (seenTs.has(ts)) return;
    events.push({ payload: p, valid: true, ts });
  });
  persist();

  const origPush = w.dataLayer.push.bind(w.dataLayer);
  w.dataLayer.push = (...args: unknown[]) => {
    args.forEach((p) => events.push({ payload: p, valid: true, ts: Date.now() }));
    persist();
    render();
    return origPush(...args);
  };
  const origDebug = w.dataLayer_debug.push.bind(w.dataLayer_debug);
  w.dataLayer_debug.push = (...args: any[]) => {
    args.forEach((p) => events.push({ payload: p.payload, valid: false, ts: p.ts }));
    persist();
    render();
    return origDebug(...args);
  };

  render();
}
