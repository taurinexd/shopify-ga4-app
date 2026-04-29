# ga4-pixel

Web Pixel Extension (Strict sandbox) responsible for the **two checkout-side
GA4 events** the brief mandates: `begin_checkout` and `purchase`.

## Why a Web Pixel and not theme JS

The Thank You page Liquid path is being deprecated in favour of Shopify's
checkout extensibility model. Subscribing to `analytics.subscribe('checkout_completed')`
inside a strict pixel is the supported, future-proof place to capture the
purchase event — and it gives us native deduplication on order-level (Shopify
fires the subscription once per order, no workaround needed).

## What it does

`src/index.ts` registers a single pixel that:

1. Reads `client_id` from `init.data.cart.attributes.ga4_cid` (the storefront
   half of the data layer writes it there via Ajax Cart API; see
   `src/adapters/client-id.ts` in the project root).
2. Maps `init.customerPrivacy` to GA4 Consent Mode v2 signals
   (`ad_storage` / `ad_user_data` / `ad_personalization` / `analytics_storage`)
   and re-evaluates on the `visitorConsentCollected` bus.
3. On `checkout_started` → POSTs `begin_checkout` cross-origin to
   `https://shopify-ga4-relay.vercel.app/api/collect`.
4. On `checkout_completed` → POSTs `purchase` to the same relay with the real
   `transaction_id`, currency, value, tax, shipping, items.

## Why cross-origin instead of App Proxy

The Strict sandbox throws `RestrictedUrlError` on any fetch whose host is
the merchant's own `<shop>.myshopify.com` (App Proxy URLs all live there),
so the App Proxy path is categorically unreachable from the pixel.
Cross-origin to a Vercel-hosted relay is the only path that works; the
relay validates `Origin` + shop pattern + payload schema + rate limit +
replay nonce before forwarding to GA4 Measurement Protocol with the
server-side `api_secret`.

## Item-payload hygiene

`lineItemsToMP` builds the items array incrementally and only includes
`item_brand`, `item_category`, `item_variant`, `discount` when the source
is a non-empty string / positive number. Shopify returns `null` for these
on products without an explicit value, and GA4 silently drops events that
contain null inside item params (verified via `/debug/mp/collect` →
`VALUE_INVALID: NULL_VALUE`). Storefront-side events use the same helper
in `src/datalayer/items.ts` for symmetry.

## Files

- `src/index.ts` — pixel source (TypeScript, bundled by Shopify CLI on deploy)
- `shopify.extension.toml` — `runtime_context = "strict"` + accountID setting
- `tsconfig.json` — strict TS targeting WebWorker globals

## See also

- Root `README.md` §4 (architecture) and §5 (event-to-file map)
- `app/routes/api.collect.tsx` — the Vercel relay this pixel talks to
- `extensions/ga4-pixel/dist/ga4-pixel.js` — the bundle Shopify ships at deploy time

For Shopify's general Web Pixel docs see
<https://shopify.dev/docs/apps/marketing/pixels/getting-started> and
<https://shopify.dev/docs/api/pixels/customer-events>.
