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
  const payload = JSON.stringify(body);
  console.log("[GA4] send() called", { relayUrl, bytes: payload.length });
  try {
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const blob = new Blob([payload], { type: "text/plain;charset=UTF-8" });
      const ok = navigator.sendBeacon(relayUrl, blob);
      console.log("[GA4] sendBeacon result", { ok });
      if (ok) return;
    } else {
      console.log("[GA4] sendBeacon not available, using fetch");
    }
    console.log("[GA4] fetch() attempting", { relayUrl });
    const res = await fetch(relayUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: payload,
      keepalive: true,
    });
    console.log("[GA4] fetch() resolved", {
      status: res.status,
      ok: res.ok,
      type: res.type,
    });
  } catch (err) {
    console.log("[GA4] send() threw", String(err));
  }
}

register(({ analytics, init }) => {
  console.log("[GA4] register() fired");
  const initAny = init as any;
  const cartAttrs: any[] =
    initAny?.data?.cart?.attributes ??
    initAny?.data?.checkout?.attributes ??
    [];
  const cidAttr = cartAttrs.find((a: any) => a?.key === "ga4_cid");
  const cid: string =
    cidAttr?.value ??
    `pixel-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  const shopFromInit = initAny?.data?.shop?.myshopifyDomain;
  const shopFromContext = initAny?.context?.document?.location?.host;
  const shop: string = shopFromInit ?? shopFromContext ?? "";
  // Strict pixel sandbox forbids fetch to the shop's own myshopifyDomain
  // (RestrictedUrlError), so the App Proxy path is unusable. Relay runs
  // on Vercel and is reached cross-origin with CORS.
  const relayUrl = "https://shopify-ga4-relay.vercel.app/api/collect";
  console.log("[GA4] init resolved", {
    shopFromInit,
    shopFromContext,
    shop,
    relayUrl,
    cid,
    hasNavigator: typeof navigator !== "undefined",
    hasSendBeacon:
      typeof navigator !== "undefined" && !!navigator.sendBeacon,
  });

  const newNonce = (): string =>
    `n-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  // TODO(PT22): derive consent dynamically from cart attributes / customerPrivacy
  const consent = {
    ad_user_data: "denied",
    ad_personalization: "denied",
  };

  analytics.subscribe("checkout_started", async (event) => {
    console.log("[GA4] checkout_started fired");
    const evAny = event as any;
    const checkout = evAny?.data?.checkout;
    if (!checkout) {
      console.log("[GA4] checkout_started: no checkout data, skipping");
      return;
    }
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
    console.log("[GA4] checkout_completed fired");
    const evAny = event as any;
    const checkout = evAny?.data?.checkout;
    if (!checkout) {
      console.log("[GA4] checkout_completed: no checkout data, skipping");
      return;
    }
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
