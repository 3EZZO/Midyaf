/**
 * Bounded in-memory sliding-window rate limiter for auth endpoints.
 * Keeps memory capped at `maxKeys` and automatically prunes expired entries.
 */
export type RateLimitVerdict = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export class SlidingWindowLimiter {
  private readonly buckets = new Map<string, number[]>();

  constructor(
    private readonly maxAttempts: number,
    private readonly windowMs: number,
    private readonly maxKeys = 10_000
  ) {}

  private prune(now: number) {
    const cutoff = now - this.windowMs;
    for (const [key, timestamps] of this.buckets) {
      const fresh = timestamps.filter((t) => t > cutoff);
      if (fresh.length === 0) {
        this.buckets.delete(key);
      } else if (fresh.length !== timestamps.length) {
        this.buckets.set(key, fresh);
      }
    }
  }

  /** Checks whether another attempt is permitted without recording one. */
  check(key: string, now = Date.now()): RateLimitVerdict {
    const cutoff = now - this.windowMs;
    const existing = (this.buckets.get(key) ?? []).filter((t) => t > cutoff);
    if (existing.length === 0) {
      this.buckets.delete(key);
    } else {
      this.buckets.set(key, existing);
    }

    if (existing.length >= this.maxAttempts) {
      const oldest = existing[0];
      const retryAfterSeconds = Math.max(1, Math.ceil((oldest + this.windowMs - now) / 1000));
      return { allowed: false, remaining: 0, retryAfterSeconds };
    }

    if (this.buckets.size >= this.maxKeys && !this.buckets.has(key)) {
      this.prune(now);
      if (this.buckets.size >= this.maxKeys) {
        return { allowed: false, remaining: 0, retryAfterSeconds: Math.ceil(this.windowMs / 1000) };
      }
    }

    return {
      allowed: true,
      remaining: Math.max(0, this.maxAttempts - existing.length),
      retryAfterSeconds: 0
    };
  }

  /** Records one attempt (e.g., a failed login or reset attempt) and returns the updated verdict. */
  record(key: string, now = Date.now()): RateLimitVerdict {
    if (this.buckets.size >= this.maxKeys && !this.buckets.has(key)) {
      this.prune(now);
      if (this.buckets.size >= this.maxKeys) {
        return { allowed: false, remaining: 0, retryAfterSeconds: Math.ceil(this.windowMs / 1000) };
      }
    }

    const cutoff = now - this.windowMs;
    const existing = (this.buckets.get(key) ?? []).filter((t) => t > cutoff);
    existing.push(now);
    this.buckets.set(key, existing);

    if (existing.length > this.maxAttempts) {
      const oldest = existing[0];
      const retryAfterSeconds = Math.max(1, Math.ceil((oldest + this.windowMs - now) / 1000));
      return { allowed: false, remaining: 0, retryAfterSeconds };
    }

    return {
      allowed: true,
      remaining: Math.max(0, this.maxAttempts - existing.length),
      retryAfterSeconds: 0
    };
  }

  /** Atomically checks and consumes one attempt. */
  consume(key: string, now = Date.now()): RateLimitVerdict {
    const verdict = this.check(key, now);
    if (!verdict.allowed) return verdict;
    return this.record(key, now);
  }

  clear(key: string) {
    this.buckets.delete(key);
  }

  reset() {
    this.buckets.clear();
  }
}
