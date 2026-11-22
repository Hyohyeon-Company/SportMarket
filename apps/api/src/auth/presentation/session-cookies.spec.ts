import { describe, expect, it } from "vitest";

import { AUTH_POLICY } from "../domain/auth-policy";
import {
  clearedCookieSpecs,
  cookiesSecureFromEnv,
  readCookie,
  serialiseCookieHeaders,
  sessionCookieSpecs,
} from "./session-cookies";

const NOW = new Date("2026-11-20T00:00:00.000Z");
const ISSUED = {
  sessionToken: "session-value",
  csrfToken: "csrf-value",
  expiresAt: new Date(NOW.getTime() + AUTH_POLICY.sessionTtlSeconds * 1000),
};

describe("session cookies", () => {
  it("marks the session cookie HttpOnly and leaves the CSRF cookie readable", () => {
    const [session, csrf] = sessionCookieSpecs(ISSUED, { secure: true, now: NOW });
    const lines = serialiseCookieHeaders([session!, csrf!]);

    expect(session!.name).toBe("sm_session");
    expect(session!.httpOnly).toBe(true);
    expect(csrf!.name).toBe("sm_csrf");
    expect(csrf!.httpOnly).toBe(false);
    expect(lines[0]).toContain("sm_session=session-value");
    expect(lines[0]).toContain("HttpOnly");
    expect(lines[1]).not.toContain("HttpOnly");
  });

  it("carries the contract's Secure and SameSite=Lax attributes on both cookies", () => {
    const lines = serialiseCookieHeaders(sessionCookieSpecs(ISSUED, { secure: true, now: NOW }));

    for (const line of lines) {
      expect(line).toContain("Secure");
      expect(line).toContain("SameSite=Lax");
      expect(line).toContain("Path=/");
    }
  });

  it("derives Max-Age from the session expiry", () => {
    const [session] = sessionCookieSpecs(ISSUED, { secure: false, now: NOW });

    expect(session!.maxAgeSeconds).toBe(AUTH_POLICY.sessionTtlSeconds);
    expect(serialiseCookieHeaders([session!])[0]).toContain(`Max-Age=${AUTH_POLICY.sessionTtlSeconds}`);
  });

  it("expires both cookies on logout", () => {
    const lines = serialiseCookieHeaders(clearedCookieSpecs({ secure: true }));

    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(line).toContain("Max-Age=0");
      expect(line).toContain("=");
    }
  });

  it("is Secure unless it is explicitly switched off", () => {
    expect(cookiesSecureFromEnv({})).toBe(true);
    expect(cookiesSecureFromEnv({ SESSION_COOKIE_SECURE: "false" })).toBe(false);
  });
});

describe("readCookie", () => {
  it("finds its own cookie among several and ignores the rest", () => {
    expect(readCookie("other=1; sm_session=abc123; sm_csrf=zzz", "sm_session")).toBe("abc123");
    expect(readCookie("sm_csrf=zzz; sm_session=abc123", "sm_session")).toBe("abc123");
  });

  it("answers null for a missing header, a missing name or an empty value", () => {
    expect(readCookie(undefined, "sm_session")).toBeNull();
    expect(readCookie("other=1", "sm_session")).toBeNull();
    expect(readCookie("sm_session=", "sm_session")).toBeNull();
  });
});
