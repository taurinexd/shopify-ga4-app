import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { take } from '../lib/rate-limit';

/**
 * Structured request log emitted at the end of every action invocation.
 * One JSON object per request — Vercel ingests stdout line-by-line so
 * this is enough to grep / pipe into a log search later. Sensitive
 * values (api_secret, full payload) are intentionally not logged.
 *
 * `status` reflects the OUTCOME the relay returned to the caller AND
 * whether the upstream MP forward succeeded — see `ok` for the
 * end-to-end success bit. A 204 from us with `forward_status: 401`
 * means GA4 rejected the event silently and the session is corrupt.
 */
interface RelayLog {
  level: 'info' | 'warn' | 'error';
  msg: string;
  request_id: string;
  shop?: string;
  client_id?: string;
  origin?: string | null;
  event_names?: string[];
  event_count?: number;
  status: number;
  ok?: boolean;
  total_ms: number;
  forward_ms?: number;
  forward_status?: number;
  reason?: string;
}

function emit(log: RelayLog): void {
  const line = JSON.stringify({ tag: 'ga4-relay', ...log });
  if (log.level === 'error') console.error(line);
  else if (log.level === 'warn') console.warn(line);
  else console.log(line);
}

/**
 * Use crypto.randomUUID where available (Node ≥19, Vercel Functions
 * runtime) so the request_id is RFC 4122-compliant and joinable across
 * log systems. If a caller propagates an `x-request-id` header (e.g.
 * the pixel pushing its own correlation ID, or an upstream load
 * balancer), prefer that — but cap length and strip control characters
 * so a hostile client can't inject a 4 KB header into our logs.
 */
function deriveRequestId(headerValue: string | null): string {
  if (headerValue) {
    const cleaned = headerValue.replace(/[^a-zA-Z0-9._:-]/g, '').slice(0, 64);
    if (cleaned.length > 0) return cleaned;
  }
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Sanitise the inbound Origin header before logging. Origin can be
 * spoofed by non-browser clients, so we never trust it for auth, but we
 * still log it for debugging — without truncation/normalisation it's an
 * XSS sink the moment we pipe Vercel logs into a dashboard. Reuse the
 * URL parser so an unparseable header is logged as null.
 */
function sanitizeOrigin(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.origin.slice(0, 256);
  } catch {
    return null;
  }
}

/**
 * Scrub the api_secret query param from any error message that might
 * include the constructed MP URL. Defence-in-depth: the secret should
 * never appear in stdout even if fetch's error message embeds the URL.
 */
function safeReason(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  return raw.replace(/api_secret=[^&\s]*/gi, 'api_secret=***');
}

/**
 * Public GA4 ingest for the strict-sandbox web pixel.
 *
 * Strict pixels cannot fetch the shop's own myshopifyDomain (Shopify
 * RestrictedUrlError), so the App Proxy path is unusable here. The pixel
 * therefore POSTs cross-origin directly to this Vercel-hosted endpoint;
 * Shopify's pixel iframe origin is webpixels.shopifyapps.com, so we
 * advertise CORS for shopifyapps.com and *.myshopify.com.
 *
 * Without an HMAC from the App Proxy, validation falls back to:
 *   - origin allowlist via CORS
 *   - shop string in payload must match `<store>.myshopify.com`
 *   - payload schema (client_id, events[].name in allowlist)
 *   - per-(shop,client_id) rate limit + replay nonce
 * This is sufficient for analytics ingest; the GA4 api_secret never leaves
 * this process.
 */

const REPLAY_WINDOW_MS = 60_000;
const ALLOWED_EVENTS = new Set(['begin_checkout', 'purchase']);
const SHOP_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;

interface NonceEntry {
  seenAt: number;
}
/**
 * In-memory replay guard — module-scoped, so each Vercel Function cold
 * container gets its own Map. Concurrent warm containers can therefore
 * each accept the same nonce once before either of them sees the other,
 * making this a single-instance soft guard, not a cluster-wide one. For
 * the analytics ingest path the failure mode is "GA4 sees one duplicate
 * event" which it dedupes anyway via client_id+timestamp; the harder
 * guarantee (cluster-wide one-shot) would need Vercel KV / Upstash. The
 * REPLAY_WINDOW_MS bound keeps the surface tiny.
 */
const seenNonces = new Map<string, NonceEntry>();

function reapNonces(now: number): void {
  const cutoff = now - REPLAY_WINDOW_MS;
  for (const [k, v] of seenNonces) {
    if (v.seenAt < cutoff) seenNonces.delete(k);
  }
}

function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return (
      host === 'webpixels.shopifyapps.com' ||
      host.endsWith('.shopifyapps.com') ||
      host.endsWith('.myshopify.com')
    );
  } catch {
    return false;
  }
}

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = isOriginAllowed(origin) ? origin! : 'null';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

interface CollectPayload {
  shop?: unknown;
  client_id?: unknown;
  consent?: unknown;
  events?: unknown;
  ts?: unknown;
  nonce?: unknown;
}

export async function loader({
  request,
}: LoaderFunctionArgs): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(request.headers.get('origin')),
    });
  }
  return new Response('Not Found', { status: 404 });
}

export async function action({
  request,
}: ActionFunctionArgs): Promise<Response> {
  const t0 = Date.now();
  const requestId = deriveRequestId(request.headers.get('x-request-id'));
  const rawOrigin = request.headers.get('origin');
  const origin = sanitizeOrigin(rawOrigin);
  const cors = corsHeaders(rawOrigin);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }
  if (request.method !== 'POST') {
    emit({
      level: 'warn',
      msg: 'method not allowed',
      request_id: requestId,
      origin,
      status: 405,
      total_ms: Date.now() - t0,
    });
    return new Response('Method Not Allowed', { status: 405, headers: cors });
  }

  let body: CollectPayload;
  try {
    const raw = await request.text();
    body = JSON.parse(raw) as CollectPayload;
  } catch {
    emit({
      level: 'warn',
      msg: 'bad request: not JSON',
      request_id: requestId,
      origin,
      status: 400,
      total_ms: Date.now() - t0,
    });
    return new Response('Bad Request', { status: 400, headers: cors });
  }

  const shop = typeof body.shop === 'string' ? body.shop.toLowerCase() : '';
  if (!SHOP_RE.test(shop)) {
    emit({
      level: 'warn',
      msg: 'invalid shop',
      request_id: requestId,
      origin,
      shop,
      status: 400,
      total_ms: Date.now() - t0,
    });
    return new Response('Invalid shop', { status: 400, headers: cors });
  }

  const clientId = typeof body.client_id === 'string' ? body.client_id : '';
  if (!clientId) {
    emit({
      level: 'warn',
      msg: 'missing client_id',
      request_id: requestId,
      origin,
      shop,
      status: 400,
      total_ms: Date.now() - t0,
    });
    return new Response('Missing client_id', { status: 400, headers: cors });
  }

  if (!Array.isArray(body.events) || body.events.length === 0) {
    emit({
      level: 'warn',
      msg: 'missing events',
      request_id: requestId,
      origin,
      shop,
      client_id: clientId,
      status: 400,
      total_ms: Date.now() - t0,
    });
    return new Response('Missing events', { status: 400, headers: cors });
  }
  // Materialise the full list of event names up front so a rejection
  // log shows the whole batch (not just the rejected one) — useful for
  // debugging "why was this batch dropped" upstream.
  const fullEventNames = (body.events as Array<{ name?: unknown }>).map((ev) =>
    typeof ev?.name === 'string' ? ev.name : '',
  );
  for (const name of fullEventNames) {
    if (!ALLOWED_EVENTS.has(name)) {
      emit({
        level: 'warn',
        msg: 'disallowed event',
        request_id: requestId,
        origin,
        shop,
        client_id: clientId,
        event_names: fullEventNames,
        event_count: fullEventNames.length,
        status: 400,
        total_ms: Date.now() - t0,
        reason: name,
      });
      return new Response(`Disallowed event: ${name}`, {
        status: 400,
        headers: cors,
      });
    }
  }
  const eventNames = fullEventNames;

  if (!take(`${shop}:${clientId}`)) {
    emit({
      level: 'warn',
      msg: 'rate limited',
      request_id: requestId,
      origin,
      shop,
      client_id: clientId,
      event_names: eventNames,
      event_count: eventNames.length,
      status: 429,
      total_ms: Date.now() - t0,
    });
    return new Response('Too Many Requests', { status: 429, headers: cors });
  }

  const now = Date.now();
  const ts = typeof body.ts === 'number' ? body.ts : now;
  if (Math.abs(now - ts) > REPLAY_WINDOW_MS) {
    emit({
      level: 'warn',
      msg: 'stale request',
      request_id: requestId,
      origin,
      shop,
      client_id: clientId,
      event_names: eventNames,
      event_count: eventNames.length,
      status: 401,
      total_ms: Date.now() - t0,
      reason: `delta_ms=${Math.abs(now - ts)}`,
    });
    return new Response('Stale request', { status: 401, headers: cors });
  }

  reapNonces(now);
  if (typeof body.nonce === 'string' && body.nonce.length > 0) {
    if (seenNonces.has(body.nonce)) {
      emit({
        level: 'warn',
        msg: 'replay nonce',
        request_id: requestId,
        origin,
        shop,
        client_id: clientId,
        event_names: eventNames,
        status: 401,
        total_ms: Date.now() - t0,
      });
      return new Response('Replay', { status: 401, headers: cors });
    }
    seenNonces.set(body.nonce, { seenAt: now });
  }

  const measurementId = process.env.GA4_MEASUREMENT_ID;
  const apiSecret = process.env.GA4_API_SECRET;
  if (!measurementId || !apiSecret) {
    emit({
      level: 'error',
      msg: 'server not configured (env missing)',
      request_id: requestId,
      origin,
      shop,
      client_id: clientId,
      event_names: eventNames,
      event_count: eventNames.length,
      status: 500,
      total_ms: Date.now() - t0,
    });
    return json(
      { error: 'Server not configured' },
      { status: 500, headers: cors },
    );
  }

  const mpUrl = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(
    measurementId,
  )}&api_secret=${encodeURIComponent(apiSecret)}`;

  // GA4 Measurement Protocol's `consent` field supports ONLY two keys:
  // `ad_user_data` and `ad_personalization`. The other GA4 Consent Mode
  // v2 keys (`ad_storage`, `analytics_storage`, `functionality_storage`,
  // `personalization_storage`, `security_storage`) are gtag.js-side only
  // — sending them in the MP payload causes the WHOLE request to be
  // silently rejected with `no such field` (verified via /debug/mp/collect).
  // Values must also be uppercase 'GRANTED' | 'DENIED'; any other casing
  // is silently dropped too.
  // Reference: https://developers.google.com/analytics/devguides/collection/protocol/ga4/sending-events#consent
  const MP_CONSENT_KEYS = new Set(['ad_user_data', 'ad_personalization']);
  const normalizeConsent = (raw: unknown): Record<string, string> | undefined => {
    if (!raw || typeof raw !== 'object') return undefined;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (!MP_CONSENT_KEYS.has(k) || typeof v !== 'string') continue;
      const upper = v.trim().toUpperCase();
      if (upper === 'GRANTED' || upper === 'DENIED') out[k] = upper;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  };

  const mpBody: Record<string, unknown> = {
    client_id: clientId,
    events: body.events,
  };
  const consent = normalizeConsent(body.consent);
  if (consent) mpBody.consent = consent;

  const tForwardStart = Date.now();
  let forwardStatus = 0;
  try {
    // Note: GA4's live /mp/collect always returns 2xx for any well-formed
    // POST, including semantically-rejected ones (bad measurement_id,
    // wrong consent casing, etc.) — those become silent drops. Validation
    // diagnostics are only available from /debug/mp/collect, which is out
    // of scope for the live ingest path.
    const resp = await fetch(mpUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mpBody),
    });
    forwardStatus = resp.status;
  } catch (e) {
    emit({
      level: 'error',
      msg: 'forward to GA4 MP failed',
      request_id: requestId,
      origin,
      shop,
      client_id: clientId,
      event_names: eventNames,
      event_count: eventNames.length,
      status: 502,
      ok: false,
      total_ms: Date.now() - t0,
      forward_ms: Date.now() - tForwardStart,
      reason: safeReason(e),
    });
    return new Response('Bad Gateway', { status: 502, headers: cors });
  }

  // If GA4 MP returned an HTTP error, the relay's own response is still
  // 204 (we want sub-200ms p99 for the pixel; surfacing upstream errors
  // would force an extra round trip). But we log `status: 502` so an
  // ops dashboard filter on `status >= 400` catches the upstream
  // failure without needing to know about `forward_status`.
  const forwardFailed = forwardStatus >= 400;
  emit({
    level: forwardFailed ? 'warn' : 'info',
    msg: 'forwarded to GA4 MP',
    request_id: requestId,
    origin,
    shop,
    client_id: clientId,
    event_names: eventNames,
    event_count: eventNames.length,
    status: forwardFailed ? 502 : 204,
    ok: !forwardFailed,
    total_ms: Date.now() - t0,
    forward_ms: Date.now() - tForwardStart,
    forward_status: forwardStatus,
  });

  return new Response(null, { status: 204, headers: cors });
}
