# Shopify GA4 Data Layer

App Shopify che espone un **data layer GA4-ready** per eventi storefront (Theme App Extension) e checkout (App Pixel cross-origin → Vercel relay → Measurement Protocol). Include validazione, debug tooling, test e CI.

## 1. Verifica rapida (senza setup Shopify)

Tutto il codice del data layer (eventi storefront + schema + adapter cart/variant) è verificabile **senza credenziali Shopify Partners**:

```bash
npm install
npm test               # 46 unit test (vitest)
npm run typecheck:src  # TS strict su src/ + extensions/ga4-pixel/
npm run lint:src       # ESLint
npm run build:ext      # bundle production storefront (vite)
```

### 1.1 Dev store live

L'implementazione è attiva e validata end-to-end su `ga4-challenge-dev.myshopify.com` (Dawn, 13 prodotti, 1 multi-variante 5 colori, EUR, Bogus Gateway). Aprendo qualunque pagina con `?ga4_debug=1` compare l'overlay shadow-DOM bottom-right con timeline degli eventi e payload espandibili. Le credenziali per la storefront password (la dev store è gated come da default Shopify) sono nella mail di consegna.

## 2. Setup completo (richiede Partners account)

```bash
cp .env.example .env  # popolare GA4_MEASUREMENT_ID, GA4_API_SECRET, ecc.
npm run shopify:dev   # link app, tunnel cloudflared, deploy extension
```

Nel dev store admin: Online Store → Themes → Customize → App embeds → toggle ON "GA4 Data Layer" + GTM Container ID. Per il pixel di checkout: Settings → Customer events → l'estensione `ga4-pixel` deve risultare attiva (auto-installata da `shopify app deploy`).

| Comando | Scopo |
|---|---|
| `npm run dev:ext` | Vite watch su `src/` → `extensions/ga4-datalayer/assets/` |
| `npm run shopify:dev` | Dev tunnel + extension live reload |
| `npm run test:e2e` | Playwright e2e (richiede `SHOPIFY_DEV_STORE_URL` + `STOREFRONT_PASSWORD`) |
| `npm run shopify:deploy:dry` | Build verification dell'app + extensions |

## 3. Opzione scelta e motivazione

**Opzione B (Shopify App con App Pixel + Theme App Extension).**

- **Riusabilità**: il brief chiede una soluzione "pensata per scalare". Un'app si installa su N store senza dover patchare ogni tema; il path A si tradurrebbe in fork del tema replicati per merchant.
- **Purchase dedup nativo**: `analytics.subscribe('checkout_completed')` fire una sola volta per ordine — Shopify garantisce l'invariante. La richiesta del brief sulla deduplicazione è risolta dall'API, non da workaround custom.
- **Compatibilità con il roadmap Shopify**: la Thank You page Liquid è in deprecation per il 2026 in favore della checkout extensibility; un'app pixel oggi continuerà a funzionare, codice nel tema della Thank You no.
- **Boundary chiare**: zero edit invasivi al tema. L'app embed block è on/off dal customize, il pixel è una custom integration in Customer events. Merchant-friendly e reversibile.

## 4. Architettura

Vedi `docs/architecture.md` per il diagramma Mermaid completo. In sintesi:

- **Storefront** (Theme App Extension `ga4-datalayer`) → `window.dataLayer` → GTM → GA4
- **Checkout** (App Pixel `ga4-pixel`, Strict sandbox) → cross-origin POST a `shopify-ga4-relay.vercel.app/api/collect` → GA4 Measurement Protocol (api_secret server-side)
- App Proxy relay (`app/routes/apps.ga4-relay.$.tsx`) **kept come reference signed-HMAC**, ma non usato dal pixel: la sandbox Strict throwa `RestrictedUrlError` su qualsiasi fetch verso `<shop>.myshopify.com/apps/...`. Cross-origin a Vercel è l'unico path raggiungibile.
- Identità cross-domain via `cart.attributes.ga4_cid` (no third-party cookie)
- Validazione Zod no-leak, debug overlay shadow-DOM, console snippet copy-pastable

## 5. Dove sono i push

| Evento | Modulo | Trigger / Hook |
|---|---|---|
| view_item_list | `src/events/view-item-list.ts` | `DOMContentLoaded` su template `collection` |
| select_item | `src/events/select-item.ts` | click delegate su `a[href*="/products/"]` |
| view_item | `src/events/view-item.ts` | `DOMContentLoaded` su `product` + variant change (`<variant-radios>`/`<variant-selects>`) |
| add_to_cart | `src/events/add-to-cart.ts` | fetch/XHR interceptor su `/cart/add.js` |
| remove_from_cart | `src/events/remove-from-cart.ts` | fetch/XHR interceptor su `/cart/change.js` (solo user-initiated, gated by `pendingUserActions`) |
| view_cart | `src/events/view-cart.ts` | `DOMContentLoaded` su `cart` o cart drawer open |
| begin_checkout | `extensions/ga4-pixel/src/index.ts` | `analytics.subscribe('checkout_started')` |
| purchase | `extensions/ga4-pixel/src/index.ts` | `analytics.subscribe('checkout_completed')` |

Entry point: `src/entry.ts`. Liquid handoff: `extensions/ga4-datalayer/blocks/ga4-embed.liquid`. Relay attivo: `app/routes/api.collect.tsx` (Vercel public endpoint, validazione Origin + shop + schema + rate limit + replay nonce). Relay App Proxy reference: `app/routes/apps.ga4-relay.$.tsx` (deprecato per il pixel, vedi docstring).

## 6. Esempi di payload

### view_item_list (PLP)
```json
{
  "event": "view_item_list",
  "ecommerce": {
    "item_list_id": "summer-collection",
    "item_list_name": "Summer Collection",
    "items": [
      { "item_id": "8123456789", "item_name": "Linen Shirt", "item_brand": "Acme",
        "item_category": "Apparel", "price": 49.90, "quantity": 1, "index": 0 }
    ]
  },
  "event_meta": { "version": "1.0", "source": "ga4-datalayer-app" }
}
```

### select_item (click PLP)
```json
{
  "event": "select_item",
  "ecommerce": {
    "item_list_id": "summer-collection",
    "item_list_name": "Summer Collection",
    "items": [
      { "item_id": "8123456789", "item_name": "Linen Shirt", "item_brand": "Acme",
        "item_category": "Apparel", "price": 49.90, "quantity": 1, "index": 3 }
    ]
  }
}
```

### view_item (PDP)
```json
{
  "event": "view_item",
  "ecommerce": {
    "currency": "EUR", "value": 49.90,
    "items": [
      { "item_id": "8123456789", "item_name": "Linen Shirt", "item_brand": "Acme",
        "item_category": "Apparel", "item_variant": "M / Blue",
        "price": 49.90, "quantity": 1 }
    ]
  }
}
```

### add_to_cart
```json
{
  "event": "add_to_cart",
  "ecommerce": {
    "currency": "EUR", "value": 49.90,
    "item_list_id": "summer-collection", "item_list_name": "Summer Collection",
    "items": [
      { "item_id": "8123456789", "item_name": "Linen Shirt", "item_brand": "Acme",
        "item_category": "Apparel", "item_variant": "M / Blue",
        "price": 49.90, "quantity": 1, "index": 3 }
    ]
  }
}
```

### remove_from_cart
```json
{
  "event": "remove_from_cart",
  "ecommerce": {
    "currency": "EUR", "value": 49.90,
    "items": [
      { "item_id": "8123456789", "item_name": "Linen Shirt",
        "item_variant": "M / Blue", "price": 49.90, "quantity": 1 }
    ]
  }
}
```

### view_cart
```json
{
  "event": "view_cart",
  "ecommerce": {
    "currency": "EUR", "value": 128.90,
    "items": [
      { "item_id": "8123456789", "item_name": "Linen Shirt", "price": 49.90, "quantity": 1 },
      { "item_id": "8123456790", "item_name": "Cotton Pants", "price": 79.00, "quantity": 1 }
    ]
  }
}
```

### begin_checkout (Measurement Protocol body, inviato dal relay)
```json
{
  "client_id": "1a2b3c4d-...-uuid",
  "consent": {
    "ad_user_data": "<GRANTED|DENIED>",
    "ad_personalization": "<GRANTED|DENIED>"
  },
  "events": [{
    "name": "begin_checkout",
    "params": {
      "currency": "EUR", "value": 128.90,
      "session_id": "1714312345", "engagement_time_msec": 100,
      "items": [{ "item_id": "8123456789", "item_name": "Linen Shirt",
                  "item_variant": "M / Blue", "price": 49.90, "quantity": 1 }]
    }
  }]
}
```

### purchase (Measurement Protocol body)
```json
{
  "client_id": "1a2b3c4d-...-uuid",
  "consent": {
    "ad_user_data": "<GRANTED|DENIED>",
    "ad_personalization": "<GRANTED|DENIED>"
  },
  "events": [{
    "name": "purchase",
    "params": {
      "transaction_id": "5678",
      "affiliation": "ga4-challenge-dev.myshopify.com",
      "currency": "EUR", "value": 128.90,
      "tax": 23.20, "shipping": 5.00, "coupon": "WELCOME10",
      "session_id": "1714312345", "engagement_time_msec": 100,
      "items": [{ "item_id": "8123456789", "item_name": "Linen Shirt",
                  "item_variant": "M / Blue", "price": 49.90, "quantity": 1, "discount": 5.00 }]
    }
  }]
}
```

> I valori `<GRANTED|DENIED>` sono dinamici dal Consent Mode v2 wrapper — vedi `src/datalayer/consent.ts`.

## 7. Strategia validazione/debug

Tre layer (vedi `src/datalayer/core.ts` + `src/debug/overlay.ts` + `docs/gtm-debug-snippet.js`):

1. **Zod schema runtime + safePush no-leak** — eventi invalidi droppati dal main `dataLayer`, tracciati su `window.dataLayer_debug` (mai inviati a GA4)
2. **Debug overlay shadow-DOM** — `?ga4_debug=1` attiva un widget bottom-right con tabella eventi, validation status, expand payload, copy JSON
3. **Console snippet** — `docs/gtm-debug-snippet.js`, copy-paste in console di qualunque store. Espone `window.GA4Audit = { last, dump, dumpDropped, counts, validate }`

Esempio audit output:
```
🟢 GA4 DataLayer Audit
Total events: 7  |  Dropped (invalid): 0
view_item_list: 1, select_item: 1, view_item: 2, add_to_cart: 1, view_cart: 1, ...
Type GA4Audit.last("view_item") for last payload
```

## 8. Magento 2 vs Shopify

Vedi `docs/magento-vs-shopify.md` per il confronto completo (8 pillar + premessa onesta).

> **Nota:** la mia esperienza pratica è su altre piattaforme; il confronto è **research-based**, ricostruito da Adobe Commerce DevDocs e codice open-source `Magento_GoogleTagManager`. Disclosure esplicita in apertura del doc.

## 9. Problemi incontrati e risoluzioni

Format: **problema** → **analisi** → **soluzione**.

- **App Pixel cookie cross-domain bloccato in Strict sandbox**
  - **Problema:** `client_id` letto da `_ga` cookie non visibile dalla sandbox checkout (cookie scope mismatch).
  - **Analisi:** Strict sandbox ha API cookie limitata, dominio diverso da storefront custom.
  - **Soluzione:** propagazione via `cart.attributes.ga4_cid`. Storefront scrive l'attributo via Ajax Cart API; pixel legge da `init.data.cart.attributes`. Cross-domain robusto, no third-party cookie.

- **Fetch interceptor ripatchato da terze app**
  - **Problema:** cart drawer di altra app sovrascriveva `window.fetch`, perdendo i nostri eventi.
  - **Analisi:** un `setInterval(5000)` per sanity check drainava la batteria mobile e rischiava loop di repatch.
  - **Soluzione:** sentinel via `Symbol.for('ga4-fetch-patched')` + trigger sanity check su user interaction (`click`/`submit`) + `REPATCH_BUDGET = 3` anti-loop. Vedi `src/adapters/cart-api.ts`.

- **Distinguere remove utente vs programmatic**
  - **Problema:** discount/bundle apps modificano cart `quantity` automaticamente, generando falsi `remove_from_cart`.
  - **Analisi:** TTL timer 500ms troppo rigido (false negative su mobile lento; false positive su discount rapido).
  - **Soluzione:** `pendingUserActions: Set<string>` popolato da click delegate su `[data-cart-remove]`; consumato dalla fetch interceptor. Network-agnostic, self-cleaning.

- **Storefront password bypass per Playwright e2e**
  - **Problema:** dev store con password protection blocca accessi Playwright; l'header `x-shopify-storefront-password` non funziona (verificato empiricamente).
  - **Soluzione:** globalSetup script POST a `/password` con `authenticity_token` recuperato da GET form, salva storage state (cookie `_shopify_essential`) → riusato da tutti gli e2e. Vedi `tests/e2e/global-setup.ts`.

- **Theme `test-data` usa `<variant-radios>` invece di `<variant-selects>`**
  - **Problema:** spec/plan iniziale assumeva solo `<variant-selects>` (Dawn standard); dev store ha theme sample che usa `<variant-radios>`.
  - **Soluzione:** selector multi-component `'variant-selects, variant-radios'` in `src/adapters/variant-observer.ts`. Fallback `MutationObserver` su `input[name="id"]` per altri temi.

- **Overlay invisibile in shadow DOM su browser Chromium-derivati**
  - **Problema:** `:host { all: initial }` resettava `display`/`position` causando `getBoundingClientRect()` 0×0 anche con `position: fixed` sul figlio.
  - **Soluzione:** ho spostato position/sizing direttamente sul `:host` con `!important` + `contain: layout style` per isolamento dal tema. Verificato su Comet (Chromium fork).

- **`view_item` duplicato sull'inizializzazione PDP**
  - **Problema:** bootstrap emetteva `view_item` iniziale, poi il `MutationObserver` su `input[name="id"]` rifiravano per il valore corrente al mount → 2 push identici.
  - **Soluzione:** `observeVariantChange` accetta `initialVariantId` per il dedup, e tiene `lastFired` per scartare ri-emissioni con stesso ID. Vedi `src/adapters/variant-observer.ts`.

- **`remove_from_cart` non catturato dal cart Dawn**
  - **Problema:** `cart-remove-button` di Dawn non espone `data-variant-id`, quindi il delegate non poteva popolare `pendingUserActions` → handleCartChange skippava il diff.
  - **Soluzione:** fallback temporale 3s (`recentRemoveClickTs`) — qualsiasi click su un selector di remove segna il flag, e `hasPendingUserAction` lo consuma se il diff cart arriva entro la finestra. Mantiene la protezione anti-falsi-positivi delle discount/bundle apps.

- **`purchase` + `begin_checkout` silently dropped da GA4 MP nonostante 204**
  - **Problema:** in produzione il relay forwardava al `/mp/collect` con `forward_status: 204` per ogni richiesta, ma gli eventi non comparivano in Realtime/standard reports. `/debug/mp/collect` validava OK, curl diretto con stesso payload arrivava — il pixel via relay no. Pattern indistinguibile da bot filter post-ingest.
  - **Analisi:** dump del body forwardato + validazione su `/debug/mp/collect` ha rivelato la causa reale: `Item param [item_variant] has unsupported value [null_value: NULL_VALUE], validationCode: VALUE_INVALID`. Shopify checkout payload restituisce `variant.title === null` per prodotti con singola variante default; il pixel includeva `item_variant: null`, GA4 lo accettava al transport layer (204) ma droppava l'intero evento prima dell'aggregazione. Stesso rischio per `item_brand` e `item_category` quando vendor/type sono null.
  - **Soluzione:** `lineItemsToMP` in `extensions/ga4-pixel/src/index.ts` ora costruisce l'item incrementalmente e include i campi opzionali (item_brand, item_category, item_variant, discount) **solo** quando sono stringhe non vuote / numeri positivi. JSON.stringify omette `undefined` ma serializza `null`, quindi la differenza è critica.
  - **Diagnostica permanente:** env-flag `GA4_DEBUG_MODE=1` sul relay inietta `debug_mode: 1` per route a DebugView (bypass bot filter); `GA4_DUMP_PAYLOAD=1` logga l'mpBody completo in stdout. Off in prod, on per dev/incident.

- **Function relay crash intermittente (`responseStatusCode: 0`) su cold start**
  - **Problema:** alcune POST a `/api/collect` ritornavano `responseStatusCode: 0` invece di 204, anche con body identico. Il pixel vedeva 204 (artefatto del `keepalive: true` fetch) ma server-side l'evento non veniva forwardato. Vercel logs mostravano `PrismaClientInitializationError: Can't reach database server` / `Timed out fetching a new connection from the connection pool`.
  - **Analisi:** `app/entry.server.tsx` static-importava `addDocumentResponseHeaders` da `app/shopify.server.ts`, che a sua volta istanzia `PrismaSessionStorage`. Il costruttore di quest'ultimo lancia `pollForTable()` (un `prisma.session.count()` con retry) e salva la promise su `.ready`. Su /api/collect (relay GA4 puro) nessuno fa `await sessionStorage.ready`; quando Neon Postgres era pausato o pool saturato, la promise rejectava → unhandled rejection → Vercel terminava la function senza response.
  - **Soluzione:** due fix incrementali. (1) `entry.server.tsx` ora `await import('./shopify.server')` dinamico — `handleRequest` fires solo per route HTML, quindi /api/collect non triggera più il chain di import. (2) `app/shopify.server.ts` aggancia un terminal `.catch(() => undefined)` su `sessionStorage.ready` per neutralizzare la rejection a livello runtime; le route che genuinamente usano la session table (admin, auth, webhooks) continuano a fare `await sessionStorage.ready` e ricevono il `MissingSessionTableError` originale come prima.

- **Zero eventi in GA4 da browser reali nonostante l'implementazione corretta**
  - **Problema:** dai test in Playwright (locale + CI) gli eventi arrivavano regolarmente; aprendo la storefront da Chrome/Safari su desktop o mobile (geolocalizzato in IT) `window.dataLayer` continuava a popolarsi ma né il pixel di checkout caricava, né i tag GA4 di GTM facevano fire. Nessun `g/collect` né `mp/collect` outbound, nessun banner consent visibile.
  - **Analisi:** `Shopify.customerPrivacy.analyticsProcessingAllowed` ritornava `undefined`, non `false`. Il dev store di default vende solo negli US, dove il banner Customer Privacy non è "richiesto" da Shopify e quindi non viene mostrato; per i visitatori EU questo si traduce in stato di consent mai registrato. Il pixel Strict (`ga4-pixel`) viene caricato da Shopify *solo* se `analyticsProcessingAllowed === true` — con `undefined` non parte affatto. Il datalayer storefront pusha comunque su `dataLayer`, ma il wrapper Consent Mode v2 mantiene `analytics_storage='denied'` di default, e la GA4 config tag in GTM (consent-aware) non firea. Playwright funzionava perché veniva geo-localizzato come US dal fingerprint headless, ricevendo defaults granted.
  - **Soluzione:** il fix è di configurazione del merchant, non di codice. Admin → Settings → Markets → aggiungere EU/Italia (o il mercato target) come selling region. Una volta che esiste un mercato regolamentato, Shopify mostra automaticamente il Customer Privacy banner; al click dell'utente su Allow, `analyticsProcessingAllowed` passa a `true` → pixel carica → eventi fluiscono. Validato end-to-end con purchase reale visibile in Realtime. Il behaviour denied-by-default è GDPR-compliant by design ed è la postura corretta per produzione; l'unica differenza con il path Playwright è che lì abbiamo storage state cookie persistenti.

## 10. Cose non chiuse

- **E2e Playwright contro live storefront non al 100% verde** — la suite passa quando eseguita con `workers: 1` su un dev store dedicato, ma alcuni cicli incontrano l'interstitial Cloudflare ("Your connection needs to be verified before you can proceed") che Shopify applica per source IP dopo una sequenza ravvicinata di request al dev store password gate. La soluzione production-grade è (a) far girare la suite contro un mock server con i payload di Shopify catturati una tantum, oppure (b) usare una storefront preview con auth bypass header. Pareto: a 2 giorni dalla deadline il ROI è negativo rispetto ai 46 unit test + Zod runtime + overlay debug + console snippet che già coprono la validazione richiesta dal brief; documentato come known limitation invece di forzare un fix fragile.
- **Copertura `sendBeacon`** — usato da alcune Cart API third-party, edge case raro, non coperto. Documentato.
- **Compatibilità Horizon** — non testata empiricamente (Horizon = nuovo reference theme Shopify 2026). Fallback `MutationObserver` dovrebbe coprire.
- **Rate limit in-memory** — sufficiente per challenge / single-instance. Produzione multi-instance richiede Redis/Upstash.
- **Polaris React vs Web Components** — Shopify sta migrando da React Polaris a web components (`s-page`, `s-section`). Il pannello admin usa la versione React (scaffold default); migrazione futura possibile.

## 11. Cosa farei con più tempo

- **Server-side GA4** via Shopify Function/Webhook per redundancy ad-blocker-proof
- **A/B test del tracking layer** (toggle versioni via `event_meta.version`, comparare data quality)
- **BigQuery export pipeline** GA4 → BQ per analisi avanzate cross-channel
- **Looker Studio template** dashboard con funnel view_item→add_to_cart→purchase, AOV per source
- **Multi-store config via metafield** per merchant con N store (centralized GTM config)
- **Test su Horizon theme** empirico per validare cross-theme compat
- **Migration a Polaris web components** + `@shopify/polaris-types`
- **Redis-based rate limit + nonce store** per multi-instance deploy

## 12. Collegamento a GTM/GA4 in produzione

1. **Setup GTM container**: importare `docs/gtm-container.json` in un nuovo container web (Admin → Import Container → Choose file). Sostituire `G-XXXXXXX` con il proprio Measurement ID GA4.
2. **Estendere container**: il template include 6 eventi storefront (view_item_list, select_item, view_item, add_to_cart, remove_from_cart, view_cart). I 2 checkout events (begin_checkout, purchase) vanno direttamente a GA4 Measurement Protocol via Vercel relay → niente tag GTM richiesto.
3. **GA4 property config**: creare property → Web data stream → enhanced measurement attivo. Misurare con `Realtime` + `DebugView` durante test.
4. **Measurement Protocol API secret**: Admin → Data streams → click stream → "Measurement Protocol API secrets" → Create. Inserire in `.env` come `GA4_API_SECRET` (consumato server-side dal relay, mai esposto al client).
5. **DNS/CSP**: whitelist `googletagmanager.com`, `google-analytics.com`. Se CSP attivo nel tema, aggiungere headers via `extensions/ga4-datalayer/blocks/ga4-embed.liquid`.
6. **Consent Mode v2 setup**: collegare a CMP (Cookiebot, OneTrust, ecc.) o usare Shopify Customer Privacy API. Il wrapper `applyConsentDefaults()` parte denied; aggiornare via `updateConsent()` dopo scelta utente.
7. **Relay config**: il pixel chiama `https://<your-vercel-host>/api/collect` cross-origin (`relayUrl` in `extensions/ga4-pixel/src/index.ts`). Per prod: deploy Remix app su Vercel/Fly, settare `GA4_MEASUREMENT_ID` + `GA4_API_SECRET` come env vars server-side. CORS allowlist nel relay accetta `*.myshopify.com` + `*.shopifyapps.com` (origin Shopify pixel sandbox).
8. **Customer Privacy banner**: Settings → Markets → assicurarsi che esista almeno un selling region regolamentato (EU/UK/CA) → Settings → Customer privacy → toggle "Show cookie banner" + scegliere "Allow / Decline" (o "Allow / Customize"). Senza questo, i visitatori EU ricevono `analyticsProcessingAllowed === undefined` e il pixel Strict non viene mai caricato (vedi §9, ultimo bullet). È la postura GDPR-compliant by-design dell'architettura.
9. **QA pre-go-live checklist**:
   - [ ] Snippet console su tutte le 6 page type
   - [ ] GA4 DebugView mostra eventi reali
   - [ ] GTM Preview mode su tutti gli 8 eventi
   - [ ] App Pixel installato e attivo (admin → Customer events)
   - [ ] Customer Privacy banner abilitato e clickabile in incognito EU

## 13. Tempo totale impiegato

**Stima onesta: ~32-36h.**

Breakdown:
- Bootstrap (scaffold, deps, configs, smoke deploy): ~3h
- Foundation TDD (schema, validator, liquid-context, client-id): ~2h
- Adapters (cart-api fetch+XHR+sentinel, variant observer): ~2.5h
- Eventi storefront (6 eventi TDD): ~3h
- Entry pipeline + GTM injection + Consent Mode: ~2h
- Theme App Ext Liquid block (con MCP validation): ~1h
- Debug overlay (shadow DOM) + console snippet: ~2h
- App Pixel + App Proxy relay (HMAC + rate limit + replay guard, MCP-verified): ~3.5h
- Admin status panel (Polaris): ~1h
- Playwright e2e + globalSetup auth bypass: ~2h
- CI workflows: ~0.5h
- Architecture diagram + M2-vs-Shopify research-based + GTM container template: ~2.5h
- README + final smoke + screenshots: ~1.5h
- Pixel deploy production Vercel + cross-origin pivot da App Proxy: ~2h
- Debug end-to-end GA4 ingest (item_variant null + Prisma session storage): ~3.5h
- Verifica delivery + e2e hardening (selettori scoped, networkidle→domcontentloaded, workers:1) + consent banner finding + README rewrite: ~3h

**Tooling speedup:** Shopify MCP plugin (`learn_shopify_api`, `search_docs_chunks`, `validate_theme`, `validate_component_codeblocks`) ha verificato API/Liquid/Polaris in tempo reale, evitando WebSearch e prevenendo bug da hallucinated APIs (es: ho scoperto via MCP che il theme test-data usa `<variant-radios>` non `<variant-selects>`, e che la firma App Proxy richiede multi-value comma-join).
