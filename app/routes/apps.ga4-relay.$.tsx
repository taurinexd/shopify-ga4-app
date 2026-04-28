import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { verifyAppProxyHmac } from '../lib/app-proxy-hmac';
import { take } from '../lib/rate-limit';

/**
 * App Proxy GA4 relay.
 *
 * Storefront pixel POSTs to `https://<shop>.myshopify.com/apps/ga4-relay/collect`,
 * which Shopify forwards to this route appending the standard proxy query
 * params (shop, logged_in_customer_id, path_prefix, timestamp, signature).
 *
 * Pipeline:
 *   1. HMAC verify the signature against SHOPIFY_API_SECRET.
 *   2. Token-bucket rate limit per (shop, client-ip).
 *   3. Replay guard: reject stale (ts beyond +/-60s) and duplicate `nonce`.
 *   4. Forward minimal payload to the GA4 Measurement Protocol with the
 *      server-side `api_secret`, which never leaves this process.
 *
 * The `$` splat in the filename matches `/apps/ga4-relay/<anything>` (e.g.
 * `/apps/ga4-relay/collect`), so the Liquid block / pixel can target any
 * sub-path it likes without needing a new route.
 */

const REPLAY_WINDOW_MS = 60_000;

interface NonceEntry {
  seenAt: number;
}
const seenNonces = new Map<string, NonceEntry>();

function reapNonces(now: number): void {
  const cutoff = now - REPLAY_WINDOW_MS;
  for (const [k, v] of seenNonces) {
    if (v.seenAt < cutoff) seenNonces.delete(k);
  }
}

interface RelayPayload {
  client_id?: unknown;
  consent?: unknown;
  events?: unknown;
  ts?: unknown;
  nonce?: unknown;
}

export async function action({ request }: ActionFunctionArgs): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const url = new URL(request.url);
  const secret = process.env.SHOPIFY_API_SECRET ?? '';
  if (!verifyAppProxyHmac(url.searchParams, secret)) {
    return new Response('Forbidden', { status: 403 });
  }

  const shop = url.searchParams.get('shop') ?? 'unknown';
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (!take(`${shop}:${ip}`)) {
    return new Response('Too Many Requests', { status: 429 });
  }

  let body: RelayPayload;
  try {
    body = (await request.json()) as RelayPayload;
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  const now = Date.now();
  const ts = typeof body.ts === 'number' ? body.ts : now;
  if (Math.abs(now - ts) > REPLAY_WINDOW_MS) {
    return new Response('Stale request', { status: 401 });
  }

  reapNonces(now);
  if (typeof body.nonce === 'string' && body.nonce.length > 0) {
    if (seenNonces.has(body.nonce)) {
      return new Response('Replay', { status: 401 });
    }
    seenNonces.set(body.nonce, { seenAt: now });
  }

  const measurementId = process.env.GA4_MEASUREMENT_ID;
  const apiSecret = process.env.GA4_API_SECRET;
  if (!measurementId || !apiSecret) {
    return json({ error: 'Server not configured' }, { status: 500 });
  }

  const mpUrl = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(
    measurementId,
  )}&api_secret=${encodeURIComponent(apiSecret)}`;

  try {
    await fetch(mpUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: body.client_id,
        consent: body.consent,
        events: body.events,
      }),
    });
  } catch {
    return new Response('Bad Gateway', { status: 502 });
  }

  return new Response(null, { status: 204 });
}

export const loader = (_args: LoaderFunctionArgs): Response =>
  new Response('Not Found', { status: 404 });
