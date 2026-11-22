import type { RateLimitDecision, RateLimiter, RateLimitPolicy } from "../../ports/auth-ports";

interface Window {
  count: number;
  startedAtMs: number;
}

/**
 * Fixed-window limiter.
 *
 * A single process window is honest for the current deployment shape (one API
 * process, no shared store). A multi-instance deployment needs a shared counter
 * (MySQL or Redis) and that is a later card, not something this adapter pretends
 * to provide.
 */
export class InMemoryRateLimiter implements RateLimiter {
  private readonly windows = new Map<string, Window>();

  consume(key: string, at: Date, policy: RateLimitPolicy): RateLimitDecision {
    const nowMs = at.getTime();
    const windowMs = policy.windowSeconds * 1000;
    const current = this.windows.get(key);
    const expired = current === undefined || nowMs - current.startedAtMs >= windowMs;
    const window: Window = expired ? { count: 1, startedAtMs: nowMs } : { count: current.count + 1, startedAtMs: current.startedAtMs };
    this.windows.set(key, window);

    if (window.count <= policy.maxAttempts) {
      return { allowed: true };
    }
    const remainingMs = window.startedAtMs + windowMs - nowMs;
    const retryAfterSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
    return { allowed: false, retryAfterSeconds };
  }

  reset(key: string): void {
    this.windows.delete(key);
  }
}
