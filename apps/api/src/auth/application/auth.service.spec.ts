import { describe, expect, it } from "vitest";

import { ApiError } from "../../common/api-error";
import { FixedClock } from "../adapters/clock";
import { CryptoTokenGenerator } from "../adapters/crypto-token-generator";
import { InMemoryAuthMailer } from "../adapters/in-memory/in-memory-auth-mailer";
import { InMemoryOneTimeTokenRepository } from "../adapters/in-memory/in-memory-one-time-token.repository";
import { InMemoryRateLimiter } from "../adapters/in-memory/in-memory-rate-limiter";
import { InMemorySessionRepository } from "../adapters/in-memory/in-memory-session.repository";
import { InMemoryUserRepository } from "../adapters/in-memory/in-memory-user.repository";
import { AUTH_POLICY } from "../domain/auth-policy";
import { Email } from "../domain/email";
import { PasswordHash } from "../domain/password";
import type { PasswordHasher } from "../ports/auth-ports";
import { AuthService, type AuthServiceDeps, type SessionSnapshot } from "./auth.service";
import type { UserAccount } from "../domain/user-account";

const START = new Date("2026-11-20T00:00:00.000Z");
const ADDRESS = "buyer@example.com";
const ORIGIN = { clientIp: "203.0.113.7" };
const OTHER_ORIGIN = { clientIp: "203.0.113.99" };

class FakePasswordHasher implements PasswordHasher {
  verifyCalls = 0;
  decoyVerifications = 0;
  private readonly decoy = PasswordHash.fromStorage("fake$decoy-nobody-supplies-this");

  async hash(plaintext: string): Promise<PasswordHash> {
    return PasswordHash.fromStorage(`fake$${plaintext}`);
  }

  async verify(plaintext: string, hash: PasswordHash): Promise<boolean> {
    this.verifyCalls += 1;
    if (hash.value === this.decoy.value) {
      this.decoyVerifications += 1;
    }
    return hash.value === `fake$${plaintext}`;
  }

  async timingDecoyHash(): Promise<PasswordHash> {
    return this.decoy;
  }
}

interface Harness {
  service: AuthService;
  users: InMemoryUserRepository;
  sessions: InMemorySessionRepository;
  tokens: InMemoryOneTimeTokenRepository;
  mailer: InMemoryAuthMailer;
  clock: FixedClock;
  hasher: FakePasswordHasher;
}

function harness(hasher: FakePasswordHasher = new FakePasswordHasher()): Harness {
  const users = new InMemoryUserRepository();
  const sessions = new InMemorySessionRepository();
  const tokens = new InMemoryOneTimeTokenRepository();
  const mailer = new InMemoryAuthMailer();
  const clock = new FixedClock(START);
  const deps: AuthServiceDeps = {
    users,
    sessions,
    tokens,
    hasher,
    tokenGenerator: new CryptoTokenGenerator(),
    clock,
    rateLimiter: new InMemoryRateLimiter(),
    mailer,
  };
  return { service: new AuthService(deps), users, sessions, tokens, mailer, clock, hasher };
}

function signupInput(overrides: { email?: string; password?: string } = {}) {
  return {
    email: Email.parse(overrides.email ?? ADDRESS),
    password: overrides.password ?? "password123",
    nickname: "판매왕",
    region: { sido: "경기", sigungu: "성남시 분당구", label: "성남시 분당구" },
    marketingOptIn: false,
  };
}

async function errorFrom(run: () => Promise<unknown>): Promise<ApiError> {
  try {
    await run();
  } catch (error) {
    if (error instanceof ApiError) {
      return error;
    }
    throw error;
  }
  throw new Error("expected an ApiError");
}

function requireUser(snapshot: SessionSnapshot): UserAccount {
  if (snapshot.user === null) {
    throw new Error("expected an authenticated snapshot");
  }
  return snapshot.user;
}

describe("signup (AC-01-1, AC-01-2)", () => {
  it("creates the account and signs it in immediately, issuing both cookie values", async () => {
    const { service, users } = harness();
    const result = await service.signup(signupInput());

    expect(users.size()).toBe(1);
    expect(result.snapshot.user?.email.value).toBe(ADDRESS);
    expect(result.snapshot.user?.isEmailVerified()).toBe(false);
    expect(result.issued.sessionToken.length).toBeGreaterThan(32);
    expect(result.issued.csrfToken).not.toBe(result.issued.sessionToken);
    expect(result.issued.expiresAt.getTime()).toBe(START.getTime() + AUTH_POLICY.sessionTtlSeconds * 1000);
  });

  it("stores only digests, never the token the client received", async () => {
    const { service } = harness();
    const result = await service.signup(signupInput());
    const resolved = await service.resolveCaller(result.issued.sessionToken);

    expect(resolved.session.tokenHash).not.toBe(result.issued.sessionToken);
    expect(resolved.session.tokenHash).toHaveLength(64);
  });

  it("refuses a second signup for the same address, case and spaces included (AC-01-2)", async () => {
    const { service, users } = harness();
    await service.signup(signupInput());

    const error = await errorFrom(() => service.signup(signupInput({ email: " BUYER@Example.com " })));

    expect(users.size()).toBe(1);
    expect(error.code).toBe("EMAIL_ALREADY_REGISTERED");
    expect(error.message).toBe("이미 가입된 이메일입니다. 로그인하거나 비밀번호를 재설정해 주세요.");
    expect(error.details).toEqual({
      fields: [{ path: "email", code: "duplicate", message: "이미 사용 중인 이메일입니다." }],
    });
  });

  it("mails a verification link whose token, once used, cannot be used again", async () => {
    const { service, mailer, users } = harness();
    await service.signup(signupInput());

    const token = mailer.lastTokenFor(ADDRESS);
    expect(token).not.toBeNull();

    await service.confirmEmailVerification({ token: token ?? "" });
    const stored = await users.findByEmail(Email.parse(ADDRESS));
    expect(stored?.isEmailVerified()).toBe(true);

    const replay = await errorFrom(() => service.confirmEmailVerification({ token: token ?? "" }));
    expect(replay.code).toBe("EMAIL_VERIFICATION_TOKEN_INVALID");
  });
});

describe("login (AC-01-5) and suspension", () => {
  it("issues a session for the right password and refuses a wrong one without saying which part failed", async () => {
    const { service } = harness();
    await service.signup(signupInput());

    const ok = await service.login({ email: Email.parse(ADDRESS), password: "password123" });
    expect(ok.snapshot.user?.email.value).toBe(ADDRESS);

    const wrongPassword = await errorFrom(() => service.login({ email: Email.parse(ADDRESS), password: "password124" }));
    const unknownEmail = await errorFrom(() => service.login({ email: Email.parse("nobody@example.com"), password: "password123" }));

    expect(wrongPassword.code).toBe("INVALID_CREDENTIALS");
    expect(unknownEmail.code).toBe("INVALID_CREDENTIALS");
    expect(wrongPassword.message).toBe(unknownEmail.message);
  });

  it("spends a hash comparison for an unknown address so timing does not reveal registration", async () => {
    const { service, hasher } = harness();

    const unknownEmail = await errorFrom(() =>
      service.login({ email: Email.parse("nobody@example.com"), password: "password123" }, ORIGIN),
    );

    expect(unknownEmail.code).toBe("INVALID_CREDENTIALS");
    expect(hasher.verifyCalls).toBe(1);
    expect(hasher.decoyVerifications).toBe(1);
  });

  it("rate-limits a single account to five attempts per minute and reports Retry-After", async () => {
    const { service, clock } = harness();
    await service.signup(signupInput());

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const error = await errorFrom(() => service.login({ email: Email.parse(ADDRESS), password: "wrong-password" }));
      expect(error.code).toBe("INVALID_CREDENTIALS");
    }

    const limited = await errorFrom(() => service.login({ email: Email.parse(ADDRESS), password: "password123" }));
    expect(limited.code).toBe("RATE_LIMITED");
    expect(typeof limited.details?.retryAfterSeconds).toBe("number");
    expect(limited.details?.retryAfterSeconds as number).toBeGreaterThanOrEqual(1);

    clock.advanceSeconds(AUTH_POLICY.rateLimits.login.windowSeconds);
    const afterWindow = await service.login({ email: Email.parse(ADDRESS), password: "password123" });
    expect(afterWindow.snapshot.user?.email.value).toBe(ADDRESS);
  });

  it("clears the counter after a successful login", async () => {
    const { service } = harness();
    await service.signup(signupInput());

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await errorFrom(() => service.login({ email: Email.parse(ADDRESS), password: "wrong-password" }));
    }
    await service.login({ email: Email.parse(ADDRESS), password: "password123" });

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const error = await errorFrom(() => service.login({ email: Email.parse(ADDRESS), password: "wrong-password" }));
      expect(error.code).toBe("INVALID_CREDENTIALS");
    }
  });

  it("blocks a suspended account with its reason, but only after the password matched", async () => {
    const { service, users } = harness();
    await service.signup(signupInput());
    const stored = await users.findByEmail(Email.parse(ADDRESS));
    stored?.suspend("반복된 허위 매물 신고 접수");
    if (stored !== null) {
      await users.save(stored);
    }

    const suspended = await errorFrom(() => service.login({ email: Email.parse(ADDRESS), password: "password123" }));
    expect(suspended.code).toBe("ACCOUNT_SUSPENDED");
    expect(suspended.details).toEqual({ suspendedReason: "반복된 허위 매물 신고 접수" });

    const wrongPassword = await errorFrom(() => service.login({ email: Email.parse(ADDRESS), password: "nope" }));
    expect(wrongPassword.code).toBe("INVALID_CREDENTIALS");
  });
});

describe("session and logout (AC-01-4)", () => {
  it("answers anonymously for a missing, unknown or expired cookie", async () => {
    const { service, clock } = harness();
    const signedUp = await service.signup(signupInput());

    expect(await service.getSession(null)).toEqual({ session: null, user: null });
    expect(await service.getSession("not-a-real-token")).toEqual({ session: null, user: null });

    clock.advanceSeconds(AUTH_POLICY.sessionTtlSeconds);
    expect(await service.getSession(signedUp.issued.sessionToken)).toEqual({ session: null, user: null });
  });

  it("revokes the session on logout so the same cookie is rejected afterwards", async () => {
    const { service } = harness();
    const signedUp = await service.signup(signupInput());
    const caller = await service.resolveCaller(signedUp.issued.sessionToken);

    await service.logout(caller);

    expect(await service.getSession(signedUp.issued.sessionToken)).toEqual({ session: null, user: null });
    const rejected = await errorFrom(() => service.resolveCaller(signedUp.issued.sessionToken));
    expect(rejected.code).toBe("UNAUTHENTICATED");
  });

  it("accepts a logout of a suspended account (the read-only rule has that exception)", async () => {
    const { service, users } = harness();
    const signedUp = await service.signup(signupInput());
    const caller = await service.resolveCaller(signedUp.issued.sessionToken);
    const stored = await users.findByEmail(Email.parse(ADDRESS));
    stored?.suspend(null);
    if (stored !== null) {
      await users.save(stored);
    }

    await expect(service.logout(caller)).resolves.toBeUndefined();
  });
});

describe("CSRF", () => {
  it("accepts only a header that echoes the readable cookie and matches the session", async () => {
    const { service } = harness();
    const signedUp = await service.signup(signupInput());
    const caller = await service.resolveCaller(signedUp.issued.sessionToken);
    const token = signedUp.issued.csrfToken;

    expect(() => {
      service.assertCsrfToken(caller, token, token);
    }).not.toThrow();

    const cases: Array<{ header: string | undefined; cookie: string | null; code: string }> = [
      { header: undefined, cookie: token, code: "CSRF_TOKEN_MISSING" },
      { header: token, cookie: null, code: "CSRF_TOKEN_MISSING" },
      { header: "", cookie: "", code: "CSRF_TOKEN_MISSING" },
      { header: token, cookie: "x".repeat(32), code: "CSRF_TOKEN_INVALID" },
      { header: "x".repeat(32), cookie: "x".repeat(32), code: "CSRF_TOKEN_INVALID" },
      { header: "short", cookie: "short", code: "CSRF_TOKEN_INVALID" },
    ];

    for (const testCase of cases) {
      const error = await errorFrom(async () => {
        service.assertCsrfToken(caller, testCase.header, testCase.cookie);
      });
      expect({ header: testCase.header, cookie: testCase.cookie, code: error.code }).toEqual({
        header: testCase.header,
        cookie: testCase.cookie,
        code: testCase.code,
      });
    }

    const missing = await errorFrom(async () => {
      service.assertCsrfToken(caller, undefined, token);
    });
    expect(missing.message).toBe("요청 확인 토큰이 없습니다. 페이지를 새로 고친 뒤 다시 시도해 주세요.");
    const mismatched = await errorFrom(async () => {
      service.assertCsrfToken(caller, token, "x".repeat(32));
    });
    expect(mismatched.message).toBe("요청을 확인할 수 없습니다. 페이지를 새로 고친 뒤 다시 시도해 주세요.");
  });
});

describe("password reset (AC-01-6)", () => {
  it("answers 202 for an unknown address and sends nothing", async () => {
    const { service, mailer } = harness();

    await expect(service.requestPasswordReset({ email: Email.parse("nobody@example.com") })).resolves.toBeUndefined();
    expect(mailer.messages()).toEqual([]);
  });

  it("changes the password, ends every old session and refuses the old password", async () => {
    const { service, mailer } = harness();
    const signedUp = await service.signup(signupInput());

    await service.requestPasswordReset({ email: Email.parse(ADDRESS) });
    const token = mailer.lastTokenFor(ADDRESS) ?? "";
    await service.confirmPasswordReset({ token, newPassword: "brandnewpass1" });

    expect(await service.getSession(signedUp.issued.sessionToken)).toEqual({ session: null, user: null });

    const oldPassword = await errorFrom(() => service.login({ email: Email.parse(ADDRESS), password: "password123" }));
    expect(oldPassword.code).toBe("INVALID_CREDENTIALS");

    const newPassword = await service.login({ email: Email.parse(ADDRESS), password: "brandnewpass1" });
    expect(newPassword.snapshot.user?.email.value).toBe(ADDRESS);
  });

  it("refuses an expired link and a replayed one with the contract's 400 code", async () => {
    const { service, mailer, clock } = harness();
    await service.signup(signupInput());
    await service.requestPasswordReset({ email: Email.parse(ADDRESS) });
    const token = mailer.lastTokenFor(ADDRESS) ?? "";

    clock.advanceSeconds(AUTH_POLICY.passwordResetTokenTtlSeconds);
    const expired = await errorFrom(() => service.confirmPasswordReset({ token, newPassword: "brandnewpass1" }));
    expect(expired.code).toBe("PASSWORD_RESET_TOKEN_INVALID");
    expect(expired.message).toBe("재설정 링크가 만료되었거나 이미 사용되었습니다. 다시 요청해 주세요.");

    await service.requestPasswordReset({ email: Email.parse(ADDRESS) });
    const fresh = mailer.lastTokenFor(ADDRESS) ?? "";
    await service.confirmPasswordReset({ token: fresh, newPassword: "brandnewpass1" });

    const replay = await errorFrom(() => service.confirmPasswordReset({ token: fresh, newPassword: "anotherpass1" }));
    expect(replay.code).toBe("PASSWORD_RESET_TOKEN_INVALID");
  });

  it("supersedes an earlier unused link when the user asks twice", async () => {
    const { service, mailer } = harness();
    await service.signup(signupInput());
    await service.requestPasswordReset({ email: Email.parse(ADDRESS) });
    const first = mailer.lastTokenFor(ADDRESS) ?? "";
    await service.requestPasswordReset({ email: Email.parse(ADDRESS) });
    const second = mailer.lastTokenFor(ADDRESS) ?? "";

    const stale = await errorFrom(() => service.confirmPasswordReset({ token: first, newPassword: "brandnewpass1" }));
    expect(stale.code).toBe("PASSWORD_RESET_TOKEN_INVALID");

    await expect(service.confirmPasswordReset({ token: second, newPassword: "brandnewpass1" })).resolves.toBeUndefined();
  });

  it("refuses an unknown token", async () => {
    const { service } = harness();
    const error = await errorFrom(() => service.confirmPasswordReset({ token: "z".repeat(40), newPassword: "brandnewpass1" }));
    expect(error.code).toBe("PASSWORD_RESET_TOKEN_INVALID");
  });
});

describe("email verification resend", () => {
  it("mails a new link for an active unverified account", async () => {
    const { service, mailer } = harness();
    const signedUp = await service.signup(signupInput());
    const before = mailer.messages().length;

    await service.resendEmailVerification(requireUser(signedUp.snapshot));

    expect(mailer.messages().length).toBe(before + 1);
  });

  it("refuses a suspended account with the read-only error", async () => {
    const { service, users } = harness();
    const signedUp = await service.signup(signupInput());
    const stored = await users.findByEmail(Email.parse(ADDRESS));
    stored?.suspend(null);
    if (stored !== null) {
      await users.save(stored);
    }
    const caller = await service.resolveCaller(signedUp.issued.sessionToken);

    const error = await errorFrom(() => service.resendEmailVerification(caller.user));
    expect(error.code).toBe("ACCOUNT_SUSPENDED");
  });

  it("does nothing for an already verified account", async () => {
    const { service, mailer, users } = harness();
    await service.signup(signupInput());
    await service.confirmEmailVerification({ token: mailer.lastTokenFor(ADDRESS) ?? "" });
    const before = mailer.messages().length;

    // The endpoint reloads the account on every request (SessionGuard), so the test
    // must hand it the stored account too: the signup snapshot still says
    // "unverified" and would make the resend send a second mail.
    const verified = await users.findByEmail(Email.parse(ADDRESS));
    if (verified === null) {
      throw new Error("expected the stored account");
    }
    await service.resendEmailVerification(verified);

    expect(mailer.messages().length).toBe(before);
  });
});

describe("rate limits per Leader decision D-4", () => {
  it("limits signups to five per minute per client address without locking out another address", async () => {
    const { service } = harness();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await service.signup(signupInput({ email: `buyer${attempt}@example.com` }), ORIGIN);
    }

    const limited = await errorFrom(() => service.signup(signupInput({ email: "buyer5@example.com" }), ORIGIN));
    expect(limited.code).toBe("RATE_LIMITED");
    expect(limited.details?.retryAfterSeconds as number).toBeGreaterThanOrEqual(1);

    await expect(service.signup(signupInput({ email: "buyer5@example.com" }), OTHER_ORIGIN)).resolves.toBeDefined();
  });

  it("limits password-reset to three per minute per address", async () => {
    const { service } = harness();
    const address = Email.parse("nobody@example.com");

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(service.requestPasswordReset({ email: address }, ORIGIN)).resolves.toBeUndefined();
    }

    const limited = await errorFrom(() => service.requestPasswordReset({ email: address }, ORIGIN));
    expect(limited.code).toBe("RATE_LIMITED");
  });

  it("limits password-reset to ten per minute per source across distinct addresses", async () => {
    const { service } = harness();

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await expect(
        service.requestPasswordReset({ email: Email.parse(`nobody${attempt}@example.com`) }, ORIGIN),
      ).resolves.toBeUndefined();
    }

    const limited = await errorFrom(() => service.requestPasswordReset({ email: Email.parse("nobody10@example.com") }, ORIGIN));
    expect(limited.code).toBe("RATE_LIMITED");
  });

  it("limits verification resends to three per minute per address", async () => {
    const { service, users } = harness();
    await service.signup(signupInput());
    const stored = await users.findByEmail(Email.parse(ADDRESS));
    if (stored === null) {
      throw new Error("expected the stored account");
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(service.resendEmailVerification(stored)).resolves.toBeUndefined();
    }

    const limited = await errorFrom(() => service.resendEmailVerification(stored));
    expect(limited.code).toBe("RATE_LIMITED");
  });
});
