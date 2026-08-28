export const RATE_LIMIT_MAX = 20; // requests per window
export const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute

const _rateLimitStore = new Map(); // ip → [timestamp, ...]

export function checkRateLimit(ip) {
  // Only rate-limit when a real client IP is identifiable. In Vercel production
  // `x-forwarded-for` is always injected by the edge; "unknown" means the
  // request arrived without any proxy header (local dev, internal calls, tests).
  if (!ip || ip === "unknown") return false;
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const timestamps = (_rateLimitStore.get(ip) || []).filter((t) => t > cutoff);
  if (timestamps.length >= RATE_LIMIT_MAX) {
    _rateLimitStore.set(ip, timestamps);
    return true; // rate-limited
  }
  timestamps.push(now);
  _rateLimitStore.set(ip, timestamps);
  // Evict very old entries to prevent unbounded growth
  if (_rateLimitStore.size > 5000) {
    const oldCutoff = now - RATE_LIMIT_WINDOW_MS * 2;
    for (const [k, ts] of _rateLimitStore) {
      if (ts[ts.length - 1] < oldCutoff) _rateLimitStore.delete(k);
    }
  }
  return false;
}

// Test helper — clear store
export function _clearRateLimitStore() {
  _rateLimitStore.clear();
}
