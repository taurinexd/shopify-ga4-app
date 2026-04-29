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
  return lines.map((l) => ({
    item_id: String(l.variant?.product?.id ?? l.variant?.id ?? ""),
    item_name: l.title ?? l.variant?.product?.title ?? "",
    item_brand: l.variant?.product?.vendor,
    item_category: l.variant?.product?.type,
    item_variant: l.variant?.title,
    price: Number(
      l.variant?.price?.amount ?? l.finalLinePrice?.amount ?? 0,
    ),
    quantity: l.quantity ?? 1,
    discount:
      l.discountAllocations?.reduce(
        (s: number, d: any) => s + Number(d.amount?.amount ?? 0),
        0,
      ) || undefined,
  }));
}

function tsToSeconds(ts: unknown): string {
  // Shopify pixel `event.timestamp` is documented as an ISO 8601 string;
  // coerce defensively to epoch seconds (also tolerate numeric runtimes).
  if (typeof ts === "number") return String(Math.floor(ts / 1000));
  if (typeof ts === "string") {
    const parsed = Date.parse(ts);
    if (!Number.isNaN(parsed)) return String(Math.floor(parsed / 1000));
  }
  return String(Math.floor(Date.now() / 1000));
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

register(({ analytics, init }) => {
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

  const newNonce = (): string =>
    `n-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  // Map Shopify's customerPrivacy flags to GA4 Consent Mode v2 signals.
  // The relay normalises casing; we send lowercase here to match how the
  // pixel initialised consent on the storefront and avoid divergence.
  const privacy = (init as { customerPrivacy?: Record<string, boolean> }).customerPrivacy;
  const marketingAllowed = privacy?.marketingAllowed === true;
  const consent = {
    // ad_user_data covers sending the user's data to Google for ads.
    ad_user_data: marketingAllowed ? "granted" : "denied",
    // ad_personalization covers using that data for personalised ads.
    ad_personalization: marketingAllowed ? "granted" : "denied",
  };

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
            session_id: tsToSeconds(evAny.timestamp),
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
            session_id: tsToSeconds(evAny.timestamp),
            engagement_time_msec: 100,
            items: lineItemsToMP(checkout.lineItems ?? []),
          },
        },
      ],
    });
  });
});
