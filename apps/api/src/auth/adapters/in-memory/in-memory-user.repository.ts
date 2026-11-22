import type { Email } from "../../domain/email";
import { UserAccount, type UserAccountState } from "../../domain/user-account";
import type { UserRepository } from "../../ports/auth-ports";

/**
 * In-memory user store for this card's tests and for a server that has no database
 * yet. The persistence card replaces it with a MySQL adapter; nothing above the
 * port changes.
 *
 * It stores state snapshots and restores a fresh aggregate on read, so a test that
 * mutates a returned entity cannot silently change the stored row — the same
 * discipline a real repository imposes.
 */
export class InMemoryUserRepository implements UserRepository {
  private readonly rows = new Map<string, UserAccountState>();

  async findById(id: string): Promise<UserAccount | null> {
    const row = this.rows.get(id);
    return row === undefined ? null : UserAccount.restore(cloneState(row));
  }

  async findByEmail(email: Email): Promise<UserAccount | null> {
    for (const row of this.rows.values()) {
      if (row.email.equals(email)) {
        return UserAccount.restore(cloneState(row));
      }
    }
    return null;
  }

  async save(user: UserAccount): Promise<void> {
    this.rows.set(user.id, cloneState(user.toState()));
  }

  /** Test helper: how many accounts exist. */
  size(): number {
    return this.rows.size;
  }
}

function cloneState(state: UserAccountState): UserAccountState {
  return {
    ...state,
    profile: {
      ...state.profile,
      region: state.profile.region === null ? null : { ...state.profile.region },
    },
  };
}
