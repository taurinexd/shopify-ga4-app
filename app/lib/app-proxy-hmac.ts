import crypto from 'node:crypto';

/**
 * Verify a Shopify App Proxy HMAC signature.
 *
 * Shopify forwards storefront requests to the configured proxy URL with these
 * query parameters appended (and any original ones preserved):
 *   - shop, logged_in_customer_id, path_prefix, timestamp, signature
 *
 * The `signature` is a hex-encoded HMAC-SHA256 of all the *other* query
 * parameters, computed as follows (per docs):
 *   1. Remove the `signature` parameter from the query map.
 *   2. For each remaining (key, values) pair build `key=value1,value2,...`
 *      using the *unencoded* values. Multiple values for the same key are
 *      joined with a comma.
 *   3. Sort those `key=value` strings lexicographically.
 *   4. Concatenate them WITH NO SEPARATOR (empty join).
 *   5. HMAC-SHA256 with the app's shared secret, hex digest.
 *   6. Compare to the provided `signature` using a constant-time comparison.
 *
 * Reference: https://shopify.dev/docs/apps/build/online-store/app-proxies/authenticate-app-proxies
 */
export function verifyAppProxyHmac(query: URLSearchParams, secret: string): boolean {
  const signature = query.get('signature');
  if (!signature || !secret) return false;

  // Group repeated keys: ?extra=1&extra=2 -> { extra: ['1', '2'] }
  const grouped = new Map<string, string[]>();
  query.forEach((value, key) => {
    if (key === 'signature') return;
    const list = grouped.get(key);
    if (list) list.push(value);
    else grouped.set(key, [value]);
  });

  const parts: string[] = [];
  for (const [key, values] of grouped) {
    parts.push(`${key}=${values.join(',')}`);
  }
  parts.sort();
  const message = parts.join('');

  const computed = crypto.createHmac('sha256', secret).update(message).digest('hex');
  if (signature.length !== computed.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(signature, 'utf8'), Buffer.from(computed, 'utf8'));
  } catch {
    return false;
  }
}
