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

L'implementazione è attiva e validata end-to-end su `ga4-challenge-dev.myshopify.com` (Dawn, 13 prodotti, 1 multi-variante 5 colori, EUR, Bogus Gateway). Aprendo qualunque pagina con `?ga4_debug=1` compare l'overlay shadow-DOM bottom-right con timeline degli eventi e payload espandibili (vedi [`screenshots_1/17-storefront-overlay-events-expanded.png`](screenshots_1/17-storefront-overlay-events-expanded.png)). Le credenziali per la storefront password (la dev store è gated come da default Shopify) sono nella mail di consegna.

### 1.2 Screenshots di riferimento

La cartella [`screenshots_1/`](screenshots_1/) contiene 17 screenshot della soluzione end-to-end, raggruppati in:

- **01–03** GA4: panoramica eventi Realtime, utenti attivi, drilldown params di un `purchase`
- **04–08** GTM container Storefront: tag, trigger, variabili, cartelle, panoramica
- **09–14** Shopify: Partners app versions (release `ga4-datalayer-18`), admin status panel custom (Polaris), themes, app overview, customer privacy con banner, theme embed block on
- **15–17** Infrastruttura: deploy Vercel, repo GitHub con CI verde, overlay sulla storefront in modalità GA

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

- **Storefront** (Theme App Extension `ga4-datalayer`) → `window.dataLayer` → GTM → GA4. Il GTM container Storefront è configurato con 6 tag GA4 + 6 Custom Event triggers + 4 DLV variables, vedi [`screenshots_1/04..08`](screenshots_1/).
- **Checkout** (App Pixel `ga4-pixel`, Strict sandbox) → cross-origin POST a `shopify-ga4-relay.vercel.app/api/collect` → GA4 Measurement Protocol (api_secret server-side). Deploy Vercel attivo: [`screenshots_1/15-vercel-relay-deployment.png`](screenshots_1/15-vercel-relay-deployment.png).
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
| view_cart | `src/events/view-cart.ts` | `DOMContentLoaded` su template `cart` (l'interceptor `/cart.js` aggiorna lo stato per il diff `remove_from_cart` ma non rifira `view_cart` per evitare doppi push sui drawer reload) |
| begin_checkout | `extensions/ga4-pixel/src/index.ts` | `analytics.subscribe('checkout_started')` |
| add_shipping_info | `extensions/ga4-pixel/src/index.ts` | `analytics.subscribe('checkout_shipping_info_submitted')` |
| add_payment_info | `extensions/ga4-pixel/src/index.ts` | `analytics.subscribe('payment_info_submitted')` |
| purchase | `extensions/ga4-pixel/src/index.ts` | `analytics.subscribe('checkout_completed')` |

Entry point: `src/entry.ts`. Liquid handoff: `extensions/ga4-datalayer/blocks/ga4-embed.liquid`. Relay attivo: `app/routes/api.collect.tsx` (Vercel public endpoint, validazione Origin + shop + schema + rate limit + replay nonce). Relay App Proxy reference: `app/routes/apps.ga4-relay.$.tsx` (deprecato per il pixel, vedi docstring).

## 6. Esempi di payload

> Payload reali catturati sul dev store `ga4-challenge-dev.myshopify.com` durante i test del 2026-04-29: stessi product ID, vendor, prezzi e collezione `all` degli screenshot `01-03` (GA4 Realtime) e `17` (overlay).

### view_item_list (PLP `/collections/all`)
```json
{
  "event": "view_item_list",
  "ecommerce": {
    "currency": "EUR",
    "item_list_id": "all",
    "item_list_name": "Products",
    "items": [
      { "item_id": "8396391645218", "item_name": "Gift Card",
        "item_brand": "Snowboard Vendor", "item_category": "giftcard",
        "price": 10, "quantity": 1, "index": 0 },
      { "item_id": "8396391809058", "item_name": "Selling Plans Ski Wax",
        "item_brand": "ga4-challenge-dev", "item_category": "accessories",
        "price": 9.95, "quantity": 1, "index": 1 },
      { "item_id": "8396391776290", "item_name": "The Complete Snowboard",
        "item_brand": "Snowboard Vendor", "item_category": "snowboard",
        "price": 699.95, "quantity": 1, "index": 7 }
    ]
  },
  "event_meta": { "version": "1.0", "source": "ga4-datalayer-app" }
}
```

### select_item (click sulla card del Complete Snowboard)
```json
{
  "event": "select_item",
  "ecommerce": {
    "currency": "EUR",
    "item_list_id": "all",
    "item_list_name": "Products",
    "items": [
      { "item_id": "8396391776290", "item_name": "The Complete Snowboard",
        "item_brand": "Snowboard Vendor", "item_category": "snowboard",
        "price": 699.95, "quantity": 1, "index": 7 }
    ]
  },
  "event_meta": { "version": "1.0", "source": "ga4-datalayer-app" }
}
```

> **Omissioni intenzionali sui list events (`view_item_list`, `select_item`)** — rispetto allo schema brief mancano due campi:
>
> - **`ecommerce.value`** — il brief lo mostra come scalar (`value: 29.90`). Su una PLP con N prodotti non c'è un singolo "valore" semanticamente sensato: sommare i prezzi di tutti gli item della lista produrrebbe numeri che misrappresentano il revenue (es. €10k+ su una collezione di 13 snowboard) e contaminerebbero le metriche GA4 che si basano su `value` (purchase revenue, item revenue per session, ecc.). GA4 e [Google Analytics docs](https://developers.google.com/analytics/devguides/collection/ga4/reference/events#view_item_list) raccomandano di omettere `value` su `view_item_list` per questa ragione. `select_item` segue lo stesso pattern per coerenza.
> - **`items[].item_variant`** — sul context PLP/click l'utente non ha ancora selezionato una variante; il Liquid `collection.products` (vedi `extensions/ga4-datalayer/blocks/ga4-embed.liquid:36-48`) non espone le varianti per non gonfiare il payload del block embed (13 prodotti × N varianti diventerebbe rapidamente kB di JSON inline). `item_variant` compare correttamente da `view_item` in poi, dove la variante è effettivamente selezionata.
>
> Entrambe le scelte sono GA4 best-practice e rispettano la semantica del data model; se il merchant volesse il path 100% letterale-brief, basta aggiungere `value: items.reduce((s,i) => s + i.price * i.quantity, 0)` ai due eventi list (1 riga ciascuno) ed estendere il Liquid block per includere `variants[0].title` (~5 righe).

### view_item (PDP `/products/the-complete-snowboard`, variante "Dawn" selezionata)
```json
{
  "event": "view_item",
  "ecommerce": {
    "currency": "EUR", "value": 699.95,
    "items": [
      { "item_id": "8396391776290", "item_name": "The Complete Snowboard",
        "item_brand": "Snowboard Vendor", "item_category": "snowboard",
        "item_variant": "Dawn", "price": 699.95, "quantity": 1 }
    ]
  },
  "event_meta": { "version": "1.0", "source": "ga4-datalayer-app" }
}
```

### add_to_cart (Complete Snowboard "Dawn" da PLP `all`)
```json
{
  "event": "add_to_cart",
  "ecommerce": {
    "currency": "EUR", "value": 699.95,
    "item_list_id": "all", "item_list_name": "Products",
    "items": [
      { "item_id": "8396391776290", "item_name": "The Complete Snowboard",
        "item_brand": "Snowboard Vendor", "item_category": "snowboard",
        "item_variant": "Dawn", "price": 699.95, "quantity": 1, "index": 7 }
    ]
  },
  "event_meta": { "version": "1.0", "source": "ga4-datalayer-app" }
}
```

### remove_from_cart
```json
{
  "event": "remove_from_cart",
  "ecommerce": {
    "currency": "EUR", "value": 699.95,
    "items": [
      { "item_id": "8396391776290", "item_name": "The Complete Snowboard",
        "item_brand": "Snowboard Vendor", "item_category": "snowboard",
        "item_variant": "Dawn", "price": 699.95, "quantity": 1 }
    ]
  },
  "event_meta": { "version": "1.0", "source": "ga4-datalayer-app" }
}
```

### view_cart
```json
{
  "event": "view_cart",
  "ecommerce": {
    "currency": "EUR", "value": 709.90,
    "items": [
      { "item_id": "8396391776290", "item_name": "The Complete Snowboard",
        "item_brand": "Snowboard Vendor", "item_category": "snowboard",
        "item_variant": "Dawn", "price": 699.95, "quantity": 1 },
      { "item_id": "8396391809058", "item_name": "Selling Plans Ski Wax",
        "item_brand": "ga4-challenge-dev", "item_category": "accessories",
        "price": 9.95, "quantity": 1 }
    ]
  },
  "event_meta": { "version": "1.0", "source": "ga4-datalayer-app" }
}
```

### begin_checkout (Measurement Protocol body, inviato dal relay Vercel)
```json
{
  "client_id": "f2cac2aa-ad01-4842-b530-3e7abe1c3c94",
  "consent": {
    "ad_user_data": "<GRANTED|DENIED>",
    "ad_personalization": "<GRANTED|DENIED>"
  },
  "events": [{
    "name": "begin_checkout",
    "params": {
      "currency": "EUR", "value": 699.95,
      "session_id": "1777466361", "engagement_time_msec": 100,
      "items": [{
        "item_id": "8396391776290", "item_name": "The Complete Snowboard",
        "item_brand": "Snowboard Vendor", "item_category": "snowboard",
        "item_variant": "Dawn", "price": 699.95, "quantity": 1
      }]
    }
  }]
}
```

### add_shipping_info (Measurement Protocol body, fired da `checkout_shipping_info_submitted`)
```json
{
  "client_id": "f2cac2aa-ad01-4842-b530-3e7abe1c3c94",
  "consent": {
    "ad_user_data": "<GRANTED|DENIED>",
    "ad_personalization": "<GRANTED|DENIED>"
  },
  "events": [{
    "name": "add_shipping_info",
    "params": {
      "currency": "EUR", "value": 699.95,
      "shipping_tier": "Standard",
      "session_id": "1777466361", "engagement_time_msec": 100,
      "items": [{
        "item_id": "8396391776290", "item_name": "The Complete Snowboard",
        "item_brand": "Snowboard Vendor", "item_category": "snowboard",
        "item_variant": "Dawn", "price": 699.95, "quantity": 1
      }]
    }
  }]
}
```

### add_payment_info (Measurement Protocol body, fired da `payment_info_submitted`)
```json
{
  "client_id": "f2cac2aa-ad01-4842-b530-3e7abe1c3c94",
  "consent": {
    "ad_user_data": "<GRANTED|DENIED>",
    "ad_personalization": "<GRANTED|DENIED>"
  },
  "events": [{
    "name": "add_payment_info",
    "params": {
      "currency": "EUR", "value": 699.95,
      "payment_type": "(per test) Gateway di simulazione",
      "session_id": "1777466361", "engagement_time_msec": 100,
      "items": [{
        "item_id": "8396391776290", "item_name": "The Complete Snowboard",
        "item_brand": "Snowboard Vendor", "item_category": "snowboard",
        "item_variant": "Dawn", "price": 699.95, "quantity": 1
      }]
    }
  }]
}
```

### purchase (Measurement Protocol body)
```json
{
  "client_id": "f2cac2aa-ad01-4842-b530-3e7abe1c3c94",
  "consent": {
    "ad_user_data": "<GRANTED|DENIED>",
    "ad_personalization": "<GRANTED|DENIED>"
  },
  "events": [{
    "name": "purchase",
    "params": {
      "transaction_id": "6363065286690",
      "affiliation": "ga4-challenge-dev.myshopify.com",
      "currency": "EUR", "value": 699.95,
      "tax": 0, "shipping": 0,
      "session_id": "1777466361", "engagement_time_msec": 100,
      "items": [{
        "item_id": "8396391776290", "item_name": "The Complete Snowboard",
        "item_brand": "Snowboard Vendor", "item_category": "snowboard",
        "item_variant": "Dawn", "price": 699.95, "quantity": 1
      }]
    }
  }]
}
```

> I valori `<GRANTED|DENIED>` sono dinamici dal Consent Mode v2 wrapper — vedi `src/datalayer/consent.ts`.

## 7. Strategia validazione/debug

Tre layer (vedi `src/datalayer/core.ts` + `src/debug/overlay.ts` + `docs/gtm-debug-snippet.js`):

1. **Zod schema runtime + safePush no-leak** — eventi invalidi droppati dal main `dataLayer`, tracciati su `window.dataLayer_debug` (mai inviati a GA4)
2. **Debug overlay shadow-DOM** — `?ga4_debug=1` attiva un widget bottom-right con tabella eventi, validation status, expand payload, copy JSON. Filtro a 3 stati (GA / GTM / All) per separare gli 8 eventi GA4 dal rumore GTM lifecycle (`gtm.js`, `gtm.dom`, `gtm.linkClick`, ecc.); Copy/Clear rispettano il filtro corrente. Live: [`screenshots_1/17-storefront-overlay-events-expanded.png`](screenshots_1/17-storefront-overlay-events-expanded.png).
3. **Console snippet** — `docs/gtm-debug-snippet.js`, copy-paste in console di qualunque store. Espone `window.GA4Audit = { last, dump, dumpDropped, counts, validate }`

Validation in produzione: GA4 Realtime mostra eventi e param drilldown end-to-end ([`01-ga4-realtime-overview-events.png`](screenshots_1/01-ga4-realtime-overview-events.png) + [`03-ga4-realtime-purchase-event-params.png`](screenshots_1/03-ga4-realtime-purchase-event-params.png)).

Esempio audit output:
```
🟢 GA4 DataLayer Audit
Total events: 7  |  Dropped (invalid): 0
view_item_list: 1, select_item: 1, view_item: 2, add_to_cart: 1, view_cart: 1, ...
Type GA4Audit.last("view_item") for last payload
```

## 8. Magento 2 vs Shopify

Confronto completo in `docs/magento-vs-shopify.md` su 8 pillar architetturali.

> Premessa: la mia esperienza pratica è su altre piattaforme, non Magento 2. Il confronto è ricostruito da Adobe Commerce DevDocs e dal codice open-source di `Magento_GoogleTagManager`; lo specifico in apertura del doc per chiarezza.

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

- **GA4 `Percorso di pagamento` mostrava 3/4 step a 0% — mancavano 2 eventi standard**
  - **Problema:** validando i dati via GA4 → Reports → Aumentare le vendite → `Percorso di pagamento`, gli step `Aggiungi spedizione` e `Aggiungi metodo di pagamento` risultavano sempre vuoti (drop-off 100% allo step `Inizia pagamento`), e `Acquista` veniva conteggiato solo via `canalizzazione aperta` perché la sequenza chiusa si rompeva a metà funnel. Il merchant non poteva rispondere alla domanda *"a che punto del checkout perdo i buyer?"* — la canalizzazione era cieca tra ingresso checkout e ordine completato.
  - **Analisi:** brief richiede esplicitamente solo `begin_checkout` e `purchase`, ma la canalizzazione standard di GA4 si aspetta i 2 step intermedi `add_shipping_info` e `add_payment_info` per raccontare il funnel. Senza, qualunque report cross-step (Funnel exploration, Percorso di pagamento, Looker Studio dashboard) collassa tra l'inizio e la fine del checkout.
  - **Soluzione:** 2 nuove `analytics.subscribe()` nel pixel — `checkout_shipping_info_submitted` → `add_shipping_info` (con `shipping_tier` da `shippingLine.title`), `payment_info_submitted` → `add_payment_info` (con `payment_type` da `transactions[0].gateway`, fallback su `paymentMethod.{name,type}` per coprire gateway diversi). Allowlist relay `app/routes/api.collect.tsx` estesa da 2 a 4 eventi. Va oltre i requisiti esplicitati dal brief; senza, il funnel report di GA4 resta cieco a metà checkout — per due righe di codice in più ha senso averlo coperto.

- **Zero eventi in GA4 da browser reali nonostante l'implementazione corretta**
  - **Problema:** dai test in Playwright (locale + CI) gli eventi arrivavano regolarmente; aprendo la storefront da Chrome/Safari su desktop o mobile (geolocalizzato in IT) `window.dataLayer` continuava a popolarsi ma né il pixel di checkout caricava, né i tag GA4 di GTM facevano fire. Nessun `g/collect` né `mp/collect` outbound, nessun banner consent visibile.
  - **Analisi:** `Shopify.customerPrivacy.analyticsProcessingAllowed` ritornava `undefined`, non `false`. Il dev store di default vende solo negli US, dove il banner Customer Privacy non è "richiesto" da Shopify e quindi non viene mostrato; per i visitatori EU questo si traduce in stato di consent mai registrato. Il pixel Strict (`ga4-pixel`) viene caricato da Shopify *solo* se `analyticsProcessingAllowed === true` — con `undefined` non parte affatto. Il datalayer storefront pusha comunque su `dataLayer`, ma il wrapper Consent Mode v2 mantiene `analytics_storage='denied'` di default, e la GA4 config tag in GTM (consent-aware) non firea. Le sessioni Playwright vedevano consent granted perché riutilizzavano lo storage state cookie persistente dalla prima esecuzione di `globalSetup`, che a sua volta aveva ottenuto consent in un contesto headless dove Shopify non aveva forzato il banner — per visitatori reali freschi questo non è mai vero senza il banner.
  - **Soluzione:** è una configurazione del merchant, non un fix nel codice. Admin → Settings → Markets → aggiungere EU/Italia (o il mercato target) come selling region. Una volta che esiste un mercato regolamentato, Shopify mostra il Customer Privacy banner; al click su Allow, `analyticsProcessingAllowed` passa a `true`, il pixel viene caricato e gli eventi fluiscono. Verificato con un purchase reale che è arrivato in Realtime. Il comportamento denied-by-default è quello che GDPR si aspetta in produzione; in Playwright la differenza è solo che lo storage state cookie persistente di `globalSetup` aveva consent già concesso.

## 10. Cose non chiuse

- **E2e Playwright contro live storefront non al 100% verde** — la suite passa quando eseguita con `workers: 1` su un dev store dedicato, ma alcuni cicli incontrano l'interstitial Cloudflare ("Your connection needs to be verified before you can proceed") che Shopify applica per source IP dopo una sequenza ravvicinata di request al dev store password gate. La via production-grade è (a) far girare la suite contro un mock server con i payload di Shopify catturati una tantum, oppure (b) usare una storefront preview con auth bypass header. La validazione richiesta dal brief è già coperta dai 46 unit test + schema Zod runtime + overlay debug + console snippet, quindi ho preferito documentare il limite invece di forzare un fix fragile.

- **`checkout-purchase.spec.ts` marcato `test.fixme`** — il pre-payment flow (PDP → add to cart → /checkout → email + country=Italy + shipping address + continue) drive correttamente via `getByLabel`. Il blocker è il payment step: Shopify's modern checkout wraps i card fields in iframe PCI separati (`Field container for: Card number/Expiry/CVV/Name`), che `getByLabel` del top frame non attraversa. Fix richiede `page.frameLocator(...)` con selettori interni Shopify che cambiano fra revisioni. Helper `tests/e2e/helpers/checkout.ts` è già in place per chi voglia hardenare l'iframe step in futuro; `purchase` resta validato end-to-end manualmente contro GA4 Realtime (vedi screenshot `01-03`), e l'unit/integration coverage del path relay (`app/routes/api.collect.tsx` schema, rate limit, replay nonce, `ip_override`) è completa.

- **Privacy-focused browser** — Brave, Comet, Firefox ETP Strict, Safari ITP avanzato bloccano i domini noti (`googletagmanager.com`, `*.google-analytics.com`) a livello network e inviano `Sec-GPC: 1` che Shopify Customer Privacy interpreta come consent denied (l'App Pixel Strict non viene caricato). Risultato: nessun evento GA da quei browser, sia storefront sia checkout. Verificato empiricamente su Comet vs Chrome vanilla — Chrome fa fluire tutto, Comet droppa tutto. È il comportamento atteso: il merchant accetta una piccola coverage gap (single-digit % di traffico privacy-strict) in cambio del rispetto della scelta del visitatore. Le due mitigazioni possibili (server-side tracking via webhook Shopify, first-party gtag proxy) sono in §11.
- **Copertura `sendBeacon`** — usato da alcune Cart API third-party, edge case raro, non coperto. Documentato.
- **Compatibilità Horizon** — non testata empiricamente (Horizon = nuovo reference theme Shopify 2026). Fallback `MutationObserver` dovrebbe coprire.
- **Rate limit in-memory** — sufficiente per challenge / single-instance. Produzione multi-instance richiede Redis/Upstash.
- **Polaris React vs Web Components** — Shopify sta migrando da React Polaris a web components (`s-page`, `s-section`). Il pannello admin usa la versione React (scaffold default); migrazione futura possibile.

## 11. Cosa farei con più tempo

### 11.1 Espansione coverage GA4 events

- ~~**Checkout funnel intermedio**~~ — implementato pre-consegna dopo aver visto in GA4 il `Percorso di pagamento` con 3 step a 0%, vedi §9. `add_shipping_info` e `add_payment_info` sono ora tracciati dal pixel.
- **Refund tracking** via webhook Shopify `orders/refunded` — endpoint `/api/refund` parallelo a `/api/collect`, riceve l'order payload e manda a GA4 MP un evento `refund` con `transaction_id` + `value`. Senza, il revenue su GA4 sovrastima perché i resi non vengono mai detratti.
- **Search tracking** — Shopify espone `analytics.subscribe('search_submitted', ...)` con `event.data.searchResult.query`. Mappa a un evento GA4 `search` standard con `search_term`. Su un catalogo medio-grande è uno dei segnali più utili per la roadmap prodotti.
- **Promotion tracking** (`view_promotion`, `select_promotion`) — quando l'utente vede o clicca un banner promo. Richiede di instrumentare i banner con `data-promotion-id` + nome via Liquid e un click/IntersectionObserver delegate sulla storefront.
- **Account events** (`sign_up`, `login`) da `customer_account.created` / `customer_account.signed_in`. Servono per separare i comportamenti logged-in vs guest in GA4.

### 11.2 Robustezza data delivery

- **Server-side fallback per browser privacy-strict** — webhook Shopify `orders/create` → relay → GA4 MP. Recupera la fascia di buyer su Brave/Comet/ETP Strict che oggi non è tracciata (vedi §10). Lo svantaggio è che si perde l'attribution session/cookie e il `client_id` va inferito: o da `order.note_attributes.ga4_cid` se è stato persistito a checkout, oppure da un hash deterministico su `customer.email`.
- **First-party proxy per gtag.js** — alias `googletagmanager.com` su un sub-dominio del merchant (es. `cdn.shop.com/gtm.js`) via Vercel rewrite. Bypassa le tracker blocklist network-layer. È una scelta che il merchant deve fare con il proprio team legale: rispettare il blocco o aggirarlo è un trade-off di postura privacy, non un default.
- **Redis-based rate limit + nonce store** per multi-instance deploy del relay (oggi è in-memory per-container, sufficiente per single-instance Vercel ma non garantisce one-shot replay protection cluster-wide).

### 11.3 Tooling & data pipeline

- **A/B test del tracking layer** — toggle versioni via `event_meta.version` già presente nei payload (`"version": "1.0", "source": "ga4-datalayer-app"`). Compare data quality fra versioni durante un rollout incrementale del data layer.
- **BigQuery export pipeline** GA4 → BQ per analisi avanzate cross-channel + retention >14 mesi (limite GA4 free tier).
- **Looker Studio template** — dashboard con funnel view_item → add_to_cart → begin_checkout → purchase, AOV per source/medium, item revenue per category, drop-off rate per checkout step (richiede 11.1 checkout funnel).

### 11.4 Compatibilità & migration

- **Multi-store config via metafield** — merchant con N store (es. .com / .uk / .it) condividono la stessa app ma necessitano GTM Container ID + GA4 Measurement ID per-shop. Spostare la config da `block.settings.gtm_id` (per-block) a metafield shop-level + UI admin per gestirla centralmente.
- **Test su Horizon theme** empirico — Horizon è il nuovo reference theme Shopify 2026 (replacement di Dawn). Fallback `MutationObserver` su `input[name="id"]` dovrebbe coprire ma non è verificato.
- **Migration a Polaris web components** (`s-page`, `s-section`, `s-card`) + `@shopify/polaris-types`. Il pannello admin usa la versione React Polaris (default scaffold); Shopify sta deprecando React Polaris in favore di web components.

## 12. Collegamento a GTM/GA4 in produzione

1. **Setup GTM container**: importare `docs/gtm-container.json` in un nuovo container web (Admin → Import Container → Choose file). Sostituire `G-XXXXXXX` con il proprio Measurement ID GA4. Il template, una volta importato, dovrebbe replicare la struttura dei [screenshots `04..08`](screenshots_1/) (6 GA4 Event tag + 6 Custom Event trigger + 4 DLV `ecommerce.*` variables).
2. **Estendere container**: il template include i 6 eventi storefront (view_item_list, select_item, view_item, add_to_cart, remove_from_cart, view_cart). I 4 eventi checkout (begin_checkout, add_shipping_info, add_payment_info, purchase) vanno direttamente a GA4 Measurement Protocol via Vercel relay, quindi non servono tag GTM per loro.
3. **GA4 property config**: creare property → Web data stream → enhanced measurement attivo. Misurare con `Realtime` + `DebugView` durante test.
4. **Measurement Protocol API secret**: Admin → Data streams → click stream → "Measurement Protocol API secrets" → Create. Inserire in `.env` come `GA4_API_SECRET` (consumato server-side dal relay, mai esposto al client).
5. **DNS/CSP**: whitelist `googletagmanager.com`, `google-analytics.com`. Se CSP attivo nel tema, aggiungere headers via `extensions/ga4-datalayer/blocks/ga4-embed.liquid`.
6. **Consent Mode v2 setup**: collegare a CMP (Cookiebot, OneTrust, ecc.) o usare Shopify Customer Privacy API. Il wrapper `applyConsentDefaults()` parte denied; aggiornare via `updateConsent()` dopo scelta utente.
7. **Relay config**: il pixel chiama `https://<your-vercel-host>/api/collect` cross-origin (`relayUrl` in `extensions/ga4-pixel/src/index.ts`). Per prod: deploy Remix app su Vercel/Fly, settare `GA4_MEASUREMENT_ID` + `GA4_API_SECRET` come env vars server-side. CORS allowlist nel relay accetta `*.myshopify.com` + `*.shopifyapps.com` (origin Shopify pixel sandbox).
8. **Customer Privacy banner**: Settings → Markets → assicurarsi che esista almeno un selling region regolamentato (EU/UK/CA) → Settings → Customer privacy → toggle "Show cookie banner" + scegliere "Allow / Decline" (o "Allow / Customize"). Senza, i visitatori EU ricevono `analyticsProcessingAllowed === undefined` e il pixel Strict non viene mai caricato (vedi §9). Setup admin: [`screenshots_1/13-shopify-admin-customer-privacy.png`](screenshots_1/13-shopify-admin-customer-privacy.png). Theme app embed e GTM Container ID: [`screenshots_1/14-shopify-theme-app-embed-toggle.png`](screenshots_1/14-shopify-theme-app-embed-toggle.png). Release history: [`screenshots_1/09-shopify-partners-app-versions.png`](screenshots_1/09-shopify-partners-app-versions.png).
9. **QA pre-go-live checklist**:
   - [ ] Snippet console (`docs/gtm-debug-snippet.js`) ritorna `GA4Audit.validate() === { ok: true }` su tutte le 6 page type storefront
   - [ ] GA4 Realtime mostra `view_item_list`, `view_item`, `add_to_cart`, `view_cart`, `begin_checkout`, `purchase` con currency/value/items popolati
   - [ ] GTM Preview mode mostra fire dei 6 GA4 Event tags storefront sui rispettivi Custom Event triggers
   - [ ] App Pixel installato e attivo (admin → Settings → Customer events)
   - [ ] Customer Privacy banner abilitato e clickabile in incognito EU

## 13. Tempo totale impiegato

**~32-36h.**

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

Buona parte del tempo è stato risparmiato grazie al plugin MCP di Shopify (`learn_shopify_api`, `search_docs_chunks`, `validate_theme`, `validate_component_codeblocks`), che ha permesso di verificare API, Liquid e Polaris contro la documentazione ufficiale invece di affidarsi a memoria o ricerca generica. Per esempio: il theme `test-data` del dev store usa `<variant-radios>` invece di `<variant-selects>` e la firma App Proxy HMAC vuole il comma-join multi-value — entrambe scoperte e gestite via MCP nelle prime ore di lavoro.
