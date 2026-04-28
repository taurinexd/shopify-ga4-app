/**
 * In-memory token-bucket rate limiter, keyed by an arbitrary string
 * (e.g. `${shop}:${ip}`).
 *
 * Defaults: 100 tokens per bucket, refilled at 100/60 tokens per second
 * (i.e. 100 requests per minute sustained, with a 100-burst allowance).
 *
 * NOTE: this state lives in process memory. For multi-instance deployments
 * the bucket must be moved to a shared store (Redis/KV); this module is
 * sufficient for single-instance serverless or local dev. Each call also
 * opportunistically reaps stale buckets to bound memory growth.
 */
const CAPACITY = 100;
const REFILL_PER_SEC = CAPACITY / 60;
const STALE_AFTER_MS = 10 * 60 * 1000; // 10 minutes idle -> drop bucket

interface Bucket {
  tokens: number;
  updated: number;
}

const buckets = new Map<string, Bucket>();
let lastReap = 0;

function reap(now: number): void {
  if (now - lastReap < 60_000) return;
  lastReap = now;
  for (const [k, b] of buckets) {
    if (now - b.updated > STALE_AFTER_MS) buckets.delete(k);
  }
}

export function take(key: string): boolean {
  const now = Date.now();
  reap(now);

  const existing = buckets.get(key);
  const bucket: Bucket = existing ?? { tokens: CAPACITY, updated: now };

  const elapsedSec = (now - bucket.updated) / 1000;
  bucket.tokens = Math.min(CAPACITY, bucket.tokens + elapsedSec * REFILL_PER_SEC);
  bucket.updated = now;

  if (bucket.tokens < 1) {
    buckets.set(key, bucket);
    return false;
  }

  bucket.tokens -= 1;
  buckets.set(key, bucket);
  return true;
}

/** Test-only: clear all buckets. Not exported in production usage. */
export function _resetForTests(): void {
  buckets.clear();
  lastReap = 0;
}
