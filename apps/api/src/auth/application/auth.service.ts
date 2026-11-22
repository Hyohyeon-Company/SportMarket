import { randomUUID } from "node:crypto";

import { Injectable, Logger, Inject } from "@nestjs/common";

import type {
  LoginCommandInput,
  EmailVerificationConfirmInput,
  PasswordResetConfirmInput,
  PasswordResetRequestInput,
  RequestOrigin,
  SignupCommandInput,
} from "./auth-commands";
import { UNSPECIFIED_ORIGIN } from "./auth-commands";
import { AUTH_DEPENDENCIES } from "../auth.tokens";
import { ApiError } from "../../common/api-error";
import { API_MESSAGES } from "../../common/api-messages";
import { AUTH_POLICY } from "../domain/auth-policy";
import { OneTimeToken, type OneTimeTokenPurpose } from "../domain/one-time-token";
import { Session } from "../domain/session";
import { UserAccount } from "../domain/user-account";
import type {
  AuthMailer,
  Clock,
  OneTimeTokenRepository,
  PasswordHasher,
  RateLimiter,
  SessionRepository,
  TokenGenerator,
  UserRepository,
} from "../ports/auth-ports";

export interface AuthServiceDeps {
  users: UserRepository;
  sessions: SessionRepository;
  tokens: OneTimeTokenRepository;
  hasher: PasswordHasher;
  tokenGenerator: TokenGenerator;
  clock: Clock;
  rateLimiter: RateLimiter;
  mailer: AuthMailer;
}

/** The two cookie values a successful signup/login hands to the client. */
export interface IssuedSession {
  sessionToken: string;
  csrfToken: string;
  expiresAt: Date;
}

/** What `GET /auth/session` needs: both null when the cookie does not authenticate. */
export interface SessionSnapshot {
  session: Session | null;
  user: UserAccount | null;
}

export interface StartedSession {
  snapshot: SessionSnapshot;
  issued: IssuedSession;
}

export interface AuthenticatedCaller {
  session: Session;
  user: UserAccount;
}

const PASSWORD_RESET_PATH = "/password-reset";
const EMAIL_VERIFICATION_PATH = "/email-verification";

/**
 * Application layer for F-01.
 *
 * Each public method is exactly one contract operation. It loads the state it
 * needs, lets the aggregate decide, arranges persistence and the outbound mail
 * side effect, and reports the result. No business rule lives here that does not
 * have a home in an entity — suspension, single-use tokens and session validity
 * are all decided by `UserAccount`, `OneTimeToken` and `Session`.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(@Inject(AUTH_DEPENDENCIES) private readonly deps: AuthServiceDeps) {}

  /** AC-01-1: signup signs the account in immediately (201 + session cookie). */
  async signup(input: SignupCommandInput, origin: RequestOrigin = UNSPECIFIED_ORIGIN): Promise<StartedSession> {
    const now = this.deps.clock.now();
    // D-4: a signup flood is a source problem, so the key is the client address.
    this.assertWithinRateLimit(`signup:${origin.clientIp}`, now, AUTH_POLICY.rateLimits.signup);

    const existing = await this.deps.users.findByEmail(input.email);
    if (existing !== null) {
      throw new ApiError(
        "EMAIL_ALREADY_REGISTERED",
        "이미 가입된 이메일입니다. 로그인하거나 비밀번호를 재설정해 주세요.",
        { fields: [{ path: "email", code: "duplicate", message: "이미 사용 중인 이메일입니다." }] },
      );
    }

    const passwordHash = await this.deps.hasher.hash(input.password);
    const user = UserAccount.register({
      id: randomUUID(),
      email: input.email,
      passwordHash,
      nickname: input.nickname,
      region: input.region,
      createdAt: now,
    });
    await this.deps.users.save(user);

    // v1 does not gate writes behind verification (A-04, OPEN-10), so a mail
    // failure must not fail the signup that already produced a session.
    await this.issueOneTimeToken(user, "email_verification", now);
    return this.startSession(user, now);
  }

  /**
   * Login.
   *
   * The password is verified before the suspension check so a wrong password on a
   * suspended account still yields the non-enumerating 401 instead of disclosing
   * the account state. Only a correct password reveals `ACCOUNT_SUSPENDED`.
   */
  async login(input: LoginCommandInput, origin: RequestOrigin = UNSPECIFIED_ORIGIN): Promise<StartedSession> {
    const now = this.deps.clock.now();
    // D-4: the threshold counts one address at one source, so a shared address on
    // a shared network does not lock out unrelated callers and a single source
    // cannot spray many addresses past the limit.
    const attemptKey = `login:${input.email.value}|${origin.clientIp}`;
    this.assertWithinRateLimit(attemptKey, now, AUTH_POLICY.rateLimits.login);

    const user = await this.deps.users.findByEmail(input.email);
    if (user === null) {
      // Spend the same work as a real comparison so an unknown address cannot be
      // distinguished by response time. The result is deliberately discarded.
      await this.deps.hasher.verify(input.password, await this.deps.hasher.timingDecoyHash());
      throw new ApiError("INVALID_CREDENTIALS", API_MESSAGES.invalidCredentials);
    }
    const matches = await this.deps.hasher.verify(input.password, user.passwordHash);
    if (!matches) {
      throw new ApiError("INVALID_CREDENTIALS", API_MESSAGES.invalidCredentials);
    }

    user.assertCanStartSession();
    this.deps.rateLimiter.reset(attemptKey);
    return this.startSession(user, now);
  }

  /** AC-01-4: the session is revoked server-side; the controller also expires the cookies. */
  async logout(caller: AuthenticatedCaller): Promise<void> {
    caller.session.revoke(this.deps.clock.now());
    await this.deps.sessions.save(caller.session);
  }

  /**
   * `GET /auth/session` answers 200 for an anonymous visitor (`authenticated:false`).
   * An expired or revoked cookie is treated as absent rather than as an error, so a
   * stale browser tab boots into the anonymous shell instead of an error page.
   */
  async getSession(sessionToken: string | null): Promise<SessionSnapshot> {
    if (sessionToken === null || sessionToken === "") {
      return { session: null, user: null };
    }
    const session = await this.deps.sessions.findByTokenHash(this.deps.tokenGenerator.hashOf(sessionToken));
    const now = this.deps.clock.now();
    if (session === null || !session.isActive(now)) {
      return { session: null, user: null };
    }
    const user = await this.deps.users.findById(session.userId);
    if (user === null || user.status === "deleted") {
      return { session: null, user: null };
    }
    return { session, user };
  }

  /** Guards use this; a missing or stale cookie is the contract's 401. */
  async resolveCaller(sessionToken: string | null): Promise<AuthenticatedCaller> {
    const snapshot = await this.getSession(sessionToken);
    if (snapshot.session === null || snapshot.user === null) {
      throw new ApiError("UNAUTHENTICATED", API_MESSAGES.unauthenticated);
    }
    return { session: snapshot.session, user: snapshot.user };
  }

  /**
   * CSRF check for state-changing requests. The header is compared against the
   * digest bound to this session, so a token from another session (or an absent
   * header) is refused with the contract's 403.
   */
  assertCsrfToken(caller: AuthenticatedCaller, headerValue: string | undefined, cookieValue: string | null): void {
    const presented = headerValue?.trim() ?? "";
    const cookie = cookieValue?.trim() ?? "";
    if (presented === "" || cookie === "") {
      throw new ApiError("CSRF_TOKEN_MISSING", API_MESSAGES.csrfMissing);
    }
    if (presented.length < AUTH_POLICY.csrfTokenMinLength || presented.length > AUTH_POLICY.csrfTokenMaxLength) {
      throw new ApiError("CSRF_TOKEN_INVALID", API_MESSAGES.csrfRejected);
    }
    // D-1 double submit: the header must echo the readable cookie, so a cross-site
    // form post cannot supply the value even though the browser would send it.
    if (presented !== cookie) {
      throw new ApiError("CSRF_TOKEN_INVALID", API_MESSAGES.csrfRejected);
    }
    if (!caller.session.matchesCsrfTokenHash(this.deps.tokenGenerator.hashOf(presented))) {
      throw new ApiError("CSRF_TOKEN_INVALID", API_MESSAGES.csrfRejected);
    }
  }

  /**
   * AC-01-6 request step: always 202, whether or not the address has an account,
   * so the endpoint cannot be used to enumerate registered emails (S10 wording).
   */
  async requestPasswordReset(input: PasswordResetRequestInput, origin: RequestOrigin = UNSPECIFIED_ORIGIN): Promise<void> {
    const now = this.deps.clock.now();
    // D-4: two limits, because a mail flood has two shapes — one inbox hammered
    // repeatedly, and one source cycling through many addresses.
    this.assertWithinRateLimit(`password-reset:${input.email.value}`, now, AUTH_POLICY.rateLimits.passwordResetPerEmail);
    this.assertWithinRateLimit(`password-reset-ip:${origin.clientIp}`, now, AUTH_POLICY.rateLimits.passwordResetPerIp);

    const user = await this.deps.users.findByEmail(input.email);
    if (user === null || user.status === "deleted") {
      return;
    }
    await this.issueOneTimeToken(user, "password_reset", now);
  }

  /** AC-01-6 confirm step: single use, 30 minutes, and every old session ends. */
  async confirmPasswordReset(input: PasswordResetConfirmInput): Promise<void> {
    const now = this.deps.clock.now();
    const token = await this.deps.tokens.findByTokenHash(this.deps.tokenGenerator.hashOf(input.token));
    if (token === null) {
      throw invalidToken("password_reset");
    }
    const user = await this.deps.users.findById(token.userId);
    if (user === null || user.status === "deleted") {
      throw invalidToken("password_reset");
    }

    token.consume(now, "password_reset");
    const passwordHash = await this.deps.hasher.hash(input.newPassword);
    user.changePassword(passwordHash);

    await this.deps.users.save(user);
    await this.deps.tokens.save(token);
    await this.deps.sessions.revokeAllForUser(user.id, now);
  }

  /**
   * Re-send the verification mail. A suspended account is refused by the read-only
   * rule; an already verified account is not an error (the S10 banner is simply
   * stale), so it answers 202 without issuing another token.
   */
  async resendEmailVerification(user: UserAccount): Promise<void> {
    user.assertCanChangeState();
    const now = this.deps.clock.now();
    // D-4: counted per normalized address, which is the inbox a flood would hit.
    this.assertWithinRateLimit(`email-verification:${user.email.value}`, now, AUTH_POLICY.rateLimits.emailVerificationPerEmail);
    if (user.isEmailVerified()) {
      return;
    }
    await this.issueOneTimeToken(user, "email_verification", now);
  }

  /** Confirming twice is harmless: the flag is already set and the token is spent. */
  async confirmEmailVerification(input: EmailVerificationConfirmInput): Promise<void> {
    const now = this.deps.clock.now();
    const token = await this.deps.tokens.findByTokenHash(this.deps.tokenGenerator.hashOf(input.token));
    if (token === null) {
      throw invalidToken("email_verification");
    }
    const user = await this.deps.users.findById(token.userId);
    if (user === null || user.status === "deleted") {
      throw invalidToken("email_verification");
    }

    token.consume(now, "email_verification");
    user.markEmailVerified(now);

    await this.deps.users.save(user);
    await this.deps.tokens.save(token);
  }

  private async startSession(user: UserAccount, now: Date): Promise<StartedSession> {
    const sessionToken = this.deps.tokenGenerator.generate();
    const csrfToken = this.deps.tokenGenerator.generate();
    const expiresAt = new Date(now.getTime() + AUTH_POLICY.sessionTtlSeconds * 1000);

    const session = Session.start({
      id: randomUUID(),
      userId: user.id,
      tokenHash: sessionToken.hash,
      csrfTokenHash: csrfToken.hash,
      issuedAt: now,
      expiresAt,
    });
    await this.deps.sessions.save(session);

    return {
      snapshot: { session, user },
      issued: { sessionToken: sessionToken.plain, csrfToken: csrfToken.plain, expiresAt },
    };
  }

  private async issueOneTimeToken(user: UserAccount, purpose: OneTimeTokenPurpose, now: Date): Promise<void> {
    const ttlSeconds =
      purpose === "password_reset" ? AUTH_POLICY.passwordResetTokenTtlSeconds : AUTH_POLICY.emailVerificationTokenTtlSeconds;

    await this.deps.tokens.invalidateOutstandingForUser(user.id, purpose, now);

    const generated = this.deps.tokenGenerator.generate();
    const token = OneTimeToken.issue({
      id: randomUUID(),
      userId: user.id,
      purpose,
      tokenHash: generated.hash,
      issuedAt: now,
      expiresAt: new Date(now.getTime() + ttlSeconds * 1000),
    });
    await this.deps.tokens.save(token);

    const path = purpose === "password_reset" ? PASSWORD_RESET_PATH : EMAIL_VERIFICATION_PATH;
    try {
      await this.deps.mailer.send({
        to: user.email.value,
        subject: purpose === "password_reset" ? "[홈짐장터] 비밀번호 재설정 안내" : "[홈짐장터] 이메일 인증 안내",
        // Client route, not an API path: the token is redeemed by POSTing it.
        text: `${path}?token=${generated.plain}`,
      });
    } catch (error) {
      // Delivery is not transactional with account state; a later resend covers it.
      this.logger.warn(`auth mail delivery failed (${purpose}): ${error instanceof Error ? error.name : "unknown"}`);
    }
  }

  private assertWithinRateLimit(key: string, now: Date, policy: { windowSeconds: number; maxAttempts: number }): void {
    const decision = this.deps.rateLimiter.consume(key, now, policy);
    if (!decision.allowed) {
      throw new ApiError("RATE_LIMITED", API_MESSAGES.rateLimited, {
        retryAfterSeconds: decision.retryAfterSeconds,
      });
    }
  }
}

function invalidToken(purpose: OneTimeTokenPurpose): ApiError {
  const error = purpose === "password_reset"
    ? { code: "PASSWORD_RESET_TOKEN_INVALID" as const, message: "재설정 링크가 만료되었거나 이미 사용되었습니다. 다시 요청해 주세요." }
    : { code: "EMAIL_VERIFICATION_TOKEN_INVALID" as const, message: "인증 링크가 만료되었거나 이미 사용되었습니다. 재발송을 요청해 주세요." };
  return new ApiError(error.code, error.message);
}
