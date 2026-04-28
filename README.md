# Shopify GA4 Data Layer

App Shopify che espone un **data layer GA4-ready** per eventi storefront (Theme App Extension) e checkout (App Pixel via App Proxy → Measurement Protocol). Include validazione, debug tooling, test e CI.

## 1. Setup locale

```bash
npm install
cp .env.example .env  # popolare GA4_MEASUREMENT_ID, GA4_API_SECRET, ecc.
npm run shopify:dev
```

`shopify app dev` linka l'app al dev store, crea un tunnel, deploya le extension. Nel dev store admin: Online Store → Themes → Customize → App embeds → toggle ON "GA4 Data Layer" e impostare GTM Container ID.

## 2. Comandi utili

| Comando | Scopo |
|---|---|
| `npm run dev:ext` | Vite watch su `src/` → `extensions/ga4-datalayer/assets/` |
| `npm run shopify:dev` | Dev tunnel + extension live reload |
| `npm test` | Vitest unit |
| `npm run test:e2e` | Playwright e2e (richiede `SHOPIFY_DEV_STORE_URL` + `STOREFRONT_PASSWORD`) |
| `npm run typecheck:src` | TS strict (src + extensions/ga4-pixel) |
| `npm run build:ext` | Bundle production storefront |
| `npm run shopify:deploy:dry` | Build verification |

## 3. Opzione scelta e motivazione

**Opzione B (Shopify App, App Pixel + Theme App Extension).**

- Brief richiede *"soluzione pensata per scalare"* → app riusabile su N store, theme no
- Tag *"avanzata"* sull'opzione B = signal senior atteso
- App Pixel risolve `purchase` dedup nativamente (richiesta esplicita brief)
- Pattern moderno Shopify post-checkout-extensibility (Thank You Liquid in deprecation 2026)
- Niente edit invasivi al tema, merchant-friendly

## 4. Architettura

Vedi `docs/architecture.md` per il diagramma Mermaid completo. In sintesi:

- **Storefront** (Theme App Extension `ga4-datalayer`) → `window.dataLayer` → GTM → GA4
- **Checkout** (App Pixel `ga4-pixel`, Strict sandbox) → POST signed → Remix App Proxy → GA4 Measurement Protocol
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

Entry point: `src/entry.ts`. Liquid handoff: `extensions/ga4-datalayer/blocks/ga4-embed.liquid`. Relay: `app/routes/apps.ga4-relay.$.tsx`.

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

## 10. Cose non chiuse

- **Copertura `sendBeacon`** — usato da alcune Cart API third-party, edge case raro, non coperto. Documentato.
- **Compatibilità Horizon** — non testata empiricamente (Horizon = nuovo reference theme Shopify 2026). Fallback `MutationObserver` dovrebbe coprire.
- **Rate limit in-memory** — sufficiente per challenge / single-instance. Produzione multi-instance richiede Redis/Upstash.
- **Polaris React vs Web Components** — Shopify sta migrando da React Polaris a web components (`s-page`, `s-section`). Il pannello admin usa la versione React (scaffold default); migrazione futura possibile.
- **Consent dinamico in App Pixel** — attualmente hardcoded `denied`. TODO: leggere `customerPrivacy` API o cart attribute per popolare dinamicamente.

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
2. **Estendere container**: il template include 6 eventi storefront (view_item_list, select_item, view_item, add_to_cart, remove_from_cart, view_cart). I 2 checkout events (begin_checkout, purchase) vanno direttamente a GA4 Measurement Protocol via App Proxy → niente tag GTM richiesto.
3. **GA4 property config**: creare property → Web data stream → enhanced measurement attivo. Misurare con `Realtime` + `DebugView` durante test.
4. **Measurement Protocol API secret**: Admin → Data streams → click stream → "Measurement Protocol API secrets" → Create. Inserire in `.env` come `GA4_API_SECRET` (consumato server-side dal relay, mai esposto al client).
5. **DNS/CSP**: whitelist `googletagmanager.com`, `google-analytics.com`. Se CSP attivo nel tema, aggiungere headers via `extensions/ga4-datalayer/blocks/ga4-embed.liquid`.
6. **Consent Mode v2 setup**: collegare a CMP (Cookiebot, OneTrust, ecc.) o usare Shopify Customer Privacy API. Il wrapper `applyConsentDefaults()` parte denied; aggiornare via `updateConsent()` dopo scelta utente.
7. **App Proxy config**: in `shopify.app.toml` → `[app_proxy]` → impostare `url` con dominio production app + `subpath = "ga4-relay"` + `prefix = "apps"`. CLI sincronizza con `shopify app config push`.
8. **QA pre-go-live checklist**:
   - [ ] Snippet console su tutte le 6 page type
   - [ ] GA4 DebugView mostra eventi reali
   - [ ] GTM Preview mode su tutti gli 8 eventi
   - [ ] App Pixel installato e attivo (admin → Customer events)
   - [ ] Consent banner integrato

## 13. Tempo totale impiegato

**Stima onesta: ~22-26h.**

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

**Tooling speedup:** Shopify MCP plugin (`learn_shopify_api`, `search_docs_chunks`, `validate_theme`, `validate_component_codeblocks`) ha verificato API/Liquid/Polaris in tempo reale, evitando WebSearch e prevenendo bug da hallucinated APIs (es: ho scoperto via MCP che il theme test-data usa `<variant-radios>` non `<variant-selects>`, e che la firma App Proxy richiede multi-value comma-join).
