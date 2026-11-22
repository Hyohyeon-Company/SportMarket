import { describe, expect, it } from "vitest";

import { Session } from "./session";

const ISSUED_AT = new Date("2026-11-20T00:00:00.000Z");
const EXPIRES_AT = new Date("2026-11-27T00:00:00.000Z");

function start(): Session {
  return Session.start({
    id: "s_1",
    userId: "u_1",
    tokenHash: "a".repeat(64),
    csrfTokenHash: "b".repeat(64),
    issuedAt: ISSUED_AT,
    expiresAt: EXPIRES_AT,
  });
}

describe("Session", () => {
  it("is active until its absolute expiry", () => {
    const session = start();

    expect(session.isActive(ISSUED_AT)).toBe(true);
    expect(session.isActive(new Date(EXPIRES_AT.getTime() - 1000))).toBe(true);
    expect(session.isActive(EXPIRES_AT)).toBe(false);
  });

  it("stops being active once revoked", () => {
    const session = start();
    session.revoke(new Date("2026-11-20T03:00:00.000Z"));

    expect(session.isActive(new Date("2026-11-20T04:00:00.000Z"))).toBe(false);
    expect(session.revokedAt).toEqual(new Date("2026-11-20T03:00:00.000Z"));
  });

  it("keeps the first revocation time when logout is repeated", () => {
    const session = start();
    session.revoke(new Date("2026-11-20T03:00:00.000Z"));
    session.revoke(new Date("2026-11-20T05:00:00.000Z"));

    expect(session.revokedAt).toEqual(new Date("2026-11-20T03:00:00.000Z"));
  });

  it("matches only the CSRF digest bound to this session", () => {
    const session = start();

    expect(session.matchesCsrfTokenHash("b".repeat(64))).toBe(true);
    expect(session.matchesCsrfTokenHash("c".repeat(64))).toBe(false);
  });
});
