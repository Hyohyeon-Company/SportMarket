import type { Email } from "../domain/email";
import type { PasswordHash } from "../domain/password";
import type { OneTimeToken, OneTimeTokenPurpose } from "../domain/one-time-token";
import type { Session } from "../domain/session";
import type { UserAccount } from "../domain/user-account";

/**
 * Persistence ports for the auth subdomain.
 *
 * The domain and application layers depend on these interfaces only, so the
 * in-memory adapters used by this card can be replaced by MySQL repositories in
 * the persistence card without touching a single business rule. Ports are shaped
 * around what the use cases need ("the session for this cookie digest"), not
 * around table shapes.
 */
export interface UserRepository {
  findById(id: string): Promise<UserAccount | null>;
  findByEmail(email: Email): Promise<UserAccount | null>;
  save(user: UserAccount): Promise<void>;
}

export interface SessionRepository {
  findByTokenHash(tokenHash: string): Promise<Session | null>;
  save(session: Session): Promise<void>;
  /** Used by password reset: one password change ends every existing session. */
  revokeAllForUser(userId: string, at: Date): Promise<void>;
}

export interface OneTimeTokenRepository {
  findByTokenHash(tokenHash: string): Promise<OneTimeToken | null>;
  save(token: OneTimeToken): Promise<void>;
  /** A new token invalidates earlier unused ones for the same purpose. */
  invalidateOutstandingForUser(userId: string, purpose: OneTimeTokenPurpose, at: Date): Promise<void>;
}

/** Password hashing is a port so the algorithm can move without touching rules. */
export interface PasswordHasher {
  hash(plaintext: string): Promise<PasswordHash>;
  verify(plaintext: string, hash: PasswordHash): Promise<boolean>;
}

/**
 * Token/value generation is a port for one reason: a test can then pin a token
 * instead of guessing what the adapter produced. `hashOf` re-derives the digest
 * for a presented value (session cookie, CSRF header, mailed link token).
 */
export interface TokenGenerator {
  generate(): { plain: string; hash: string };
  hashOf(plain: string): string;
}

export interface Clock {
  now(): Date;
}

export type RateLimitDecision =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

export interface RateLimitPolicy {
  windowSeconds: number;
  maxAttempts: number;
}

export interface RateLimiter {
  /**
   * Counts one attempt against `key` under the caller's policy and reports whether
   * it may proceed. The policy is a parameter, not adapter state, so the login
   * threshold (contract-fixed) stays visibly distinct from the per-address
   * defaults the contract does not fix.
   */
  consume(key: string, at: Date, policy: RateLimitPolicy): RateLimitDecision;
  /** Clears the window, so a successful login does not count toward the next one. */
  reset(key: string): void;
}

export interface MailMessage {
  to: string;
  subject: string;
  /** Body text only: the v1 contract has no templating requirement. */
  text: string;
}

/**
 * Outbound mail is a port with no production adapter in this card (the contract
 * forbids depending on real delivery here). The in-memory adapter records messages
 * so tests can assert a token was issued, and a later card supplies the transport.
 */
export interface AuthMailer {
  send(message: MailMessage): Promise<void>;
}
