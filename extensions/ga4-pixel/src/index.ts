import { register } from "@shopify/web-pixels-extension";

interface MPItem {
  item_id: string;
  item_name: string;
  item_brand?: string;
  item_category?: string;
  item_variant?: string;
  price: number;
  quantity: number;
  discount?: number;
}

function lineItemsToMP(lines: any[]): MPItem[] {
  return lines.map((l) => {
    // GA4 MP rejects items with null-valued params (silent drop on the
    // live /mp/collect endpoint, but visible as VALUE_INVALID via
    // /debug/mp/collect). Shopify's checkout payload routinely returns
    // `variant.title === null` for products with a single default
    // variant — including item_variant with that null value would cause
    // the entire purchase event to be silently dropped from Realtime
    // and standard reports. Build the item incrementally and only
    // include optional fields when they're non-null/undefined strings.
    const item: MPItem = {
      item_id: String(l.variant?.product?.id ?? l.variant?.id ?? ""),
      item_name: l.title ?? l.variant?.product?.title ?? "",
      price: Number(
        l.variant?.price?.amount ?? l.finalLinePrice?.amount ?? 0,
      ),
      quantity: l.quantity ?? 1,
    };
    const brand = l.variant?.product?.vendor;
    if (typeof brand === "string" && brand) item.item_brand = brand;
    const category = l.variant?.product?.type;
    if (typeof category === "string" && category) item.item_category = category;
    const variant = l.variant?.title;
    if (typeof variant === "string" && variant) item.item_variant = variant;
    const discount = l.discountAllocations?.reduce(
      (s: number, d: any) => s + Number(d.amount?.amount ?? 0),
      0,
    );
    if (typeof discount === "number" && discount > 0) item.discount = discount;
    return item;
  });
}

type CustomerPrivacy = {
  analyticsProcessingAllowed?: boolean;
  marketingAllowed?: boolean;
  preferencesProcessingAllowed?: boolean;
  saleOfDataAllowed?: boolean;
};

function consentFromPrivacy(cp: CustomerPrivacy | undefined): {
  ad_storage: "granted" | "denied";
  ad_user_data: "granted" | "denied";
  ad_personalization: "granted" | "denied";
  analytics_storage: "granted" | "denied";
} {
  const marketing = cp?.marketingAllowed === true;
  const analytics = cp?.analyticsProcessingAllowed === true;
  return {
    ad_storage: marketing ? "granted" : "denied",
    ad_user_data: marketing ? "granted" : "denied",
    ad_personalization: marketing ? "granted" : "denied",
    analytics_storage: analytics ? "granted" : "denied",
  };
}

async function send(relayUrl: string, body: unknown): Promise<void> {
  // The strict pixel sandbox runs as a Web Worker; navigator there is a
  // WorkerNavigator (no sendBeacon), so fetch is the only outbound option.
  // Content-Type text/plain keeps the request CORS-simple (no preflight)
  // while still carrying a JSON string the relay parses with JSON.parse.
  try {
    await fetch(relayUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify(body),
      keepalive: true,
    });
  } catch {
    // Swallow — pixel sandbox cannot surface errors and analytics must
    // never break checkout.
  }
}

register(({ analytics, init, customerPrivacy: privacyApi }) => {
  const initAny = init as any;
  const cartAttrs: any[] =
    initAny?.data?.cart?.attributes ??
    initAny?.data?.checkout?.attributes ??
    [];
  const cidAttr = cartAttrs.find((a: any) => a?.key === "ga4_cid");
  const cid: string =
    cidAttr?.value ??
    `pixel-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  const shop: string =
    initAny?.data?.shop?.myshopifyDomain ??
    initAny?.context?.document?.location?.host ??
    "";

  // Strict pixel sandbox throws RestrictedUrlError on same-origin fetch
  // (anything on the shop's own myshopifyDomain except Admin GraphQL),
  // so the App Proxy URL is unusable from here. We POST cross-origin to
  // the Vercel relay; the server validates Origin, shop, schema, rate
  // limit, and replay nonce, then forwards to GA4 MP with api_secret
  // server-side.
  const relayUrl = "https://shopify-ga4-relay.vercel.app/api/collect";

  // GA4 expects session_id to be stable across all events in the same
  // user session. Generating a new session_id per event (via the
  // checkout_started/checkout_completed timestamps) makes GA4 treat each
  // event as a session boundary, which in practice triggers silent drops
  // when multiple purchases share the same client_id (e.g. repeated
  // tests on a dev store). Snapshot once at register() time and reuse
  // across both subscribe callbacks; each fresh pixel sandbox load
  // produces a new stable session_id, which is the correct behavior.
  const sessionId = String(Math.floor(Date.now() / 1000));

  const newNonce = (): string =>
    `n-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  // Map Shopify's customerPrivacy to GA4 Consent Mode v2 signals.
  // Lowercase here for readability; the relay (api.collect.tsx) normalises
  // to UPPERCASE, which GA4 MP requires (any other casing is silently
  // dropped, no error returned).
  //
  // Mapping:
  //   marketingAllowed         -> ad_storage, ad_user_data, ad_personalization
  //   analyticsProcessingAllowed -> analytics_storage
  // The pixel itself only loads when analyticsProcessingAllowed is true,
  // so analytics_storage will almost always be 'granted' here — but GA4
  // still wants the explicit signal, otherwise sessions get routed
  // through cookieless modeling and conversions are understated.
  let consent = consentFromPrivacy(init.customerPrivacy);

  // Re-evaluate when the buyer changes their mind mid-session via a CMP
  // banner. The canonical channel is the customerPrivacy event bus
  // (PrivacyApi.d.ts), not the analytics one — events on the analytics
  // bus accept arbitrary string keys at the type level but never fire
  // for consent changes.
  privacyApi.subscribe("visitorConsentCollected", (e) => {
    consent = consentFromPrivacy(e.customerPrivacy);
  });

  analytics.subscribe("checkout_started", async (event) => {
    const evAny = event as any;
    const checkout = evAny?.data?.checkout;
    if (!checkout) return;
    await send(relayUrl, {
      shop,
      client_id: cid,
      ts: Date.now(),
      nonce: newNonce(),
      consent,
      events: [
        {
          name: "begin_checkout",
          params: {
            currency: checkout.currencyCode,
            value: Number(checkout.totalPrice?.amount ?? 0),
            session_id: sessionId,
            engagement_time_msec: 100,
            items: lineItemsToMP(checkout.lineItems ?? []),
          },
        },
      ],
    });
  });

  analytics.subscribe("checkout_completed", async (event) => {
    const evAny = event as any;
    const checkout = evAny?.data?.checkout;
    if (!checkout) return;
    await send(relayUrl, {
      shop,
      client_id: cid,
      ts: Date.now(),
      nonce: newNonce(),
      consent,
      events: [
        {
          name: "purchase",
          params: {
            transaction_id: String(checkout.order?.id ?? ""),
            affiliation: shop,
            currency: checkout.currencyCode,
            value: Number(checkout.totalPrice?.amount ?? 0),
            tax: Number(checkout.totalTax?.amount ?? 0),
            shipping: Number(checkout.shippingLine?.price?.amount ?? 0),
            coupon: checkout.discountApplications?.[0]?.title,
            session_id: sessionId,
            engagement_time_msec: 100,
            items: lineItemsToMP(checkout.lineItems ?? []),
          },
        },
      ],
    });
  });
});
