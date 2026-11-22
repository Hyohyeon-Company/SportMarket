import { OneTimeToken, type OneTimeTokenPurpose, type OneTimeTokenState } from "../../domain/one-time-token";
import type { OneTimeTokenRepository } from "../../ports/auth-ports";

export class InMemoryOneTimeTokenRepository implements OneTimeTokenRepository {
  private readonly rows = new Map<string, OneTimeTokenState>();

  async findByTokenHash(tokenHash: string): Promise<OneTimeToken | null> {
    for (const row of this.rows.values()) {
      if (row.tokenHash === tokenHash) {
        return OneTimeToken.restore({ ...row });
      }
    }
    return null;
  }

  async save(token: OneTimeToken): Promise<void> {
    this.rows.set(token.id, token.toState());
  }

  /**
   * A re-requested link supersedes the older one, so a user who asks twice cannot
   * end up with two live reset links for the same purpose.
   */
  async invalidateOutstandingForUser(userId: string, purpose: OneTimeTokenPurpose, at: Date): Promise<void> {
    for (const [id, row] of this.rows) {
      if (row.userId !== userId || row.purpose !== purpose || row.consumedAt !== null) {
        continue;
      }
      this.rows.set(id, { ...row, consumedAt: at });
    }
  }

  /** Test helper: number of stored tokens regardless of state. */
  size(): number {
    return this.rows.size;
  }
}
