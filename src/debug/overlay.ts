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
}
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
.row { padding: 6px 12px; border-bottom: 1px solid #333; cursor: pointer; }
.row.invalid { background: #5b1d1d; }
.row .name { font-weight: 600; }
.row .ts { color: #888; font-size: 10px; margin-left: 6px; }
pre { white-space: pre-wrap; word-break: break-all; font-size: 11px; padding: 8px 12px; background: #0a0a0a; margin: 0; }
button { background: #333; color: #f0f0f0; border: 0; padding: 4px 8px; border-radius: 4px; cursor: pointer; }
`;

export function initOverlay(): void {
  if (document.getElementById('ga4-debug-overlay')) return;
  const host = document.createElement('div');
  host.id = 'ga4-debug-overlay';
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = STYLES;
  shadow.appendChild(style);

  const root = document.createElement('div');
  root.className = 'root';
  shadow.appendChild(root);
  const header = document.createElement('div');
  header.className = 'header';
  header.innerHTML = `<strong>GA4 DataLayer Debug</strong> <span id="count">0</span>
    <span style="flex:1"></span>
    <button id="copy">Copy</button>
    <button id="clear">Clear</button>`;
  root.appendChild(header);
  const list = document.createElement('div');
  list.id = 'list';
  root.appendChild(list);

  const STORAGE_KEY = 'ga4_debug_events';
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

  function render(): void {
    list.innerHTML = '';
    events.slice().reverse().forEach((e) => {
      const row = document.createElement('div');
      row.className = `row ${e.valid ? '' : 'invalid'}`;
      const name = (e.payload as any)?.event ?? '<unknown>';
      row.innerHTML = `<span class="name">${e.valid ? '✓' : '✗'} ${name}</span>
        <span class="ts">${new Date(e.ts).toLocaleTimeString()}</span>`;
      const pre = document.createElement('pre');
      pre.style.display = 'none';
      pre.textContent = JSON.stringify(e.payload, null, 2);
      row.appendChild(pre);
      row.addEventListener('click', () => {
        pre.style.display = pre.style.display === 'none' ? 'block' : 'none';
      });
      list.appendChild(row);
    });
    (shadow.getElementById('count') as HTMLElement).textContent = String(events.length);
  }

  shadow.getElementById('copy')!.addEventListener('click', () => {
    navigator.clipboard.writeText(JSON.stringify(events, null, 2));
  });
  shadow.getElementById('clear')!.addEventListener('click', () => {
    events.length = 0;
    persist();
    render();
  });

  const w = window as any;
  w.dataLayer = w.dataLayer || [];
  w.dataLayer_debug = w.dataLayer_debug || [];

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
