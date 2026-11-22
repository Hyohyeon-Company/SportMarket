import { describe, expect, it } from "vitest";

import { InMemoryRateLimiter } from "./in-memory-rate-limiter";

const POLICY = { windowSeconds: 60, maxAttempts: 5 };
const T0 = new Date("2026-11-20T00:00:00.000Z");

describe("InMemoryRateLimiter", () => {
  it("allows attempt five and refuses attempt six with a Retry-After value", () => {
    const limiter = new InMemoryRateLimiter();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(limiter.consume("login:a@b.co", T0, POLICY).allowed).toBe(true);
    }
    const decision = limiter.consume("login:a@b.co", T0, POLICY);

    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.retryAfterSeconds).toBe(60);
    }
  });

  it("opens a new window after the policy window elapses", () => {
    const limiter = new InMemoryRateLimiter();
    for (let attempt = 0; attempt < 6; attempt += 1) {
      limiter.consume("login:a@b.co", T0, POLICY);
    }

    const later = new Date(T0.getTime() + POLICY.windowSeconds * 1000);
    expect(limiter.consume("login:a@b.co", later, POLICY).allowed).toBe(true);
  });

  it("keeps counts separate per key and can be reset", () => {
    const limiter = new InMemoryRateLimiter();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      limiter.consume("login:a@b.co", T0, POLICY);
    }

    expect(limiter.consume("login:c@d.co", T0, POLICY).allowed).toBe(true);
    limiter.reset("login:a@b.co");
    expect(limiter.consume("login:a@b.co", T0, POLICY).allowed).toBe(true);
  });

  it("never reports a Retry-After below one second", () => {
    const limiter = new InMemoryRateLimiter();
    const first = new Date(T0.getTime() + 59_500);
    for (let attempt = 0; attempt < 6; attempt += 1) {
      limiter.consume("login:a@b.co", first, POLICY);
    }

    const decision = limiter.consume("login:a@b.co", new Date(first.getTime() + 900), POLICY);
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    }
  });
});
