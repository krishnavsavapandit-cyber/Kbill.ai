/**
 * Edge-Compatible In-Memory Sliding Window Rate Limiter
 * Protects public endpoints (booking, auth, webhooks) from brute-force and DoS.
 * Compatible with Next.js Edge Middleware and Node.js runtimes.
 */

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitRecord>();

function cleanupExpired(now: number): void {
  if (store.size > 200) {
    store.forEach((record, key) => {
      if (now > record.resetAt) {
        store.delete(key);
      }
    });
  }
}

export interface RateLimitOptions {
  limit: number; // Maximum requests allowed within windowMs
  windowMs: number; // Duration of window in milliseconds
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
}

export function checkRateLimit(key: string, options: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  cleanupExpired(now);

  const existing = store.get(key);

  if (!existing || now > existing.resetAt) {
    // New or expired window
    const resetAt = now + options.windowMs;
    store.set(key, { count: 1, resetAt });
    return {
      success: true,
      limit: options.limit,
      remaining: options.limit - 1,
      resetAt,
      retryAfterSeconds: Math.ceil(options.windowMs / 1000),
    };
  }

  // Active window
  if (existing.count >= options.limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    return {
      success: false,
      limit: options.limit,
      remaining: 0,
      resetAt: existing.resetAt,
      retryAfterSeconds,
    };
  }

  existing.count += 1;
  const remaining = options.limit - existing.count;
  const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));

  return {
    success: true,
    limit: options.limit,
    remaining,
    resetAt: existing.resetAt,
    retryAfterSeconds,
  };
}

/**
 * Reset helper for testing
 */
export function resetRateLimitStore(): void {
  store.clear();
}
