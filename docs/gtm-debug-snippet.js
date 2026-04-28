/* GA4 DataLayer Audit — paste in browser console of a Shopify store running ga4-datalayer */
(function GA4Audit_init() {
  const dl = window.dataLayer || [];
  const dbg = window.dataLayer_debug || [];
  const REQUIRED = [
    'view_item_list', 'select_item', 'view_item',
    'add_to_cart', 'remove_from_cart', 'view_cart',
    'begin_checkout', 'purchase',
  ];
  const counts = {};
  REQUIRED.forEach((n) => (counts[n] = 0));
  dl.forEach((e) => { if (e && e.event && counts[e.event] !== undefined) counts[e.event]++; });

  console.log('%c🟢 GA4 DataLayer Audit', 'font-weight:bold;color:#4ade80;font-size:14px');
  console.table(counts);
  console.log(`Total events: ${dl.length} | Dropped (invalid): ${dbg.length}`);
  if (dbg.length) console.warn('Dropped events:', dbg);

  window.GA4Audit = {
    last(name) { return dl.filter((e) => e?.event === name).at(-1); },
    dump() { return JSON.stringify(dl, null, 2); },
    dumpDropped() { return JSON.stringify(dbg, null, 2); },
    counts() { return { ...counts }; },
    validate() {
      const missing = REQUIRED.filter((n) => counts[n] === 0);
      return missing.length ? { ok: false, missing } : { ok: true };
    },
  };
  console.log('Type GA4Audit.last("view_item") for last payload, GA4Audit.dump() for full JSON');
})();
