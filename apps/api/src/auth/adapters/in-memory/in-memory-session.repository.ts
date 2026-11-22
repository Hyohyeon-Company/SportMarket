import { Session, type SessionState } from "../../domain/session";
import type { SessionRepository } from "../../ports/auth-ports";

export class InMemorySessionRepository implements SessionRepository {
  private readonly rows = new Map<string, SessionState>();

  async findByTokenHash(tokenHash: string): Promise<Session | null> {
    for (const row of this.rows.values()) {
      if (row.tokenHash === tokenHash) {
        return Session.restore({ ...row });
      }
    }
    return null;
  }

  async save(session: Session): Promise<void> {
    this.rows.set(session.id, session.toState());
  }

  /** Password reset ends every session of the account in one call (AC-01-6). */
  async revokeAllForUser(userId: string, at: Date): Promise<void> {
    for (const [id, row] of this.rows) {
      if (row.userId !== userId || row.revokedAt !== null) {
        continue;
      }
      const session = Session.restore({ ...row });
      session.revoke(at);
      this.rows.set(id, session.toState());
    }
  }

  /** Test helper: number of stored sessions regardless of state. */
  size(): number {
    return this.rows.size;
  }
}
