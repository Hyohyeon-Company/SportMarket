export interface SessionState {
  id: string;
  userId: string;
  /** SHA-256 of the cookie value. The plaintext token is never persisted. */
  tokenHash: string;
  /** SHA-256 of the CSRF value handed to the client in a readable cookie. */
  csrfTokenHash: string;
  issuedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}

/**
 * Login session aggregate.
 *
 * A session is its own aggregate, not part of the account: it is created and
 * revoked independently, and "revoke every session of this user" (password reset)
 * is a bulk operation across the collection. Keeping it separate is what makes
 * that operation expressible without loading or rewriting the account.
 *
 * "Active" is a single question answered in one place — not revoked and not past
 * its expiry — so logout, password reset and the session endpoint cannot disagree
 * about whether a cookie still authenticates.
 */
export class Session {
  private constructor(private state: SessionState) {}

  static start(input: {
    id: string;
    userId: string;
    tokenHash: string;
    csrfTokenHash: string;
    issuedAt: Date;
    expiresAt: Date;
  }): Session {
    return new Session({
      id: input.id,
      userId: input.userId,
      tokenHash: input.tokenHash,
      csrfTokenHash: input.csrfTokenHash,
      issuedAt: input.issuedAt,
      expiresAt: input.expiresAt,
      revokedAt: null,
    });
  }

  static restore(state: SessionState): Session {
    return new Session({ ...state });
  }

  get id(): string {
    return this.state.id;
  }

  get userId(): string {
    return this.state.userId;
  }

  get tokenHash(): string {
    return this.state.tokenHash;
  }

  get csrfTokenHash(): string {
    return this.state.csrfTokenHash;
  }

  get issuedAt(): Date {
    return this.state.issuedAt;
  }

  get expiresAt(): Date {
    return this.state.expiresAt;
  }

  get revokedAt(): Date | null {
    return this.state.revokedAt;
  }

  isActive(now: Date): boolean {
    return this.state.revokedAt === null && now.getTime() < this.state.expiresAt.getTime();
  }

  /** Revoking twice is a no-op so logout stays idempotent after a double click. */
  revoke(now: Date): void {
    if (this.state.revokedAt === null) {
      this.state = { ...this.state, revokedAt: now };
    }
  }

  /** Compares digests, so the plaintext CSRF value is never stored server-side. */
  matchesCsrfTokenHash(candidateHash: string): boolean {
    return this.state.csrfTokenHash === candidateHash;
  }

  toState(): SessionState {
    return { ...this.state };
  }
}
