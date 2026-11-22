import { ApiError } from "../../common/api-error";
import type { Email } from "./email";
import type { PasswordHash } from "./password";
import type { RegionValue } from "./profile";

/** `components.schemas.UserStatus`. */
export type UserStatus = "active" | "suspended" | "deleted";

export interface UserProfileState {
  nickname: string;
  region: RegionValue | null;
  bio: string;
  joinedAt: Date;
}

export interface UserAccountState {
  id: string;
  email: Email;
  passwordHash: PasswordHash;
  status: UserStatus;
  emailVerifiedAt: Date | null;
  createdAt: Date;
  suspendedReason: string | null;
  profile: UserProfileState;
}

const SUSPENDED_LOGIN_MESSAGE = "이용이 정지된 계정입니다. 이의가 있으면 문의 경로로 알려 주세요.";
const SUSPENDED_WRITE_MESSAGE = "이용이 정지된 계정입니다. 조회만 가능합니다.";
const INVALID_CREDENTIALS_MESSAGE = "이메일 또는 비밀번호가 올바르지 않습니다.";

/**
 * Account aggregate root.
 *
 * It owns the invariants that must be true together for one account: the
 * credential that proves identity, the status that gates new sessions and writes,
 * and the email-verification flag. Sessions and one-time tokens are separate
 * aggregates — they have their own lifecycle and are revoked in bulk — so this
 * entity never accumulates a collection of them (see `session.ts` and
 * `one-time-token.ts`).
 *
 * Business operations are named rather than exposed as setters: there is no
 * `setStatus`, only `suspend`, and no `setPassword`, only `changePassword`.
 */
export class UserAccount {
  private constructor(private state: UserAccountState) {}

  static register(input: {
    id: string;
    email: Email;
    passwordHash: PasswordHash;
    nickname: string;
    region: RegionValue;
    createdAt: Date;
  }): UserAccount {
    return new UserAccount({
      id: input.id,
      email: input.email,
      passwordHash: input.passwordHash,
      status: "active",
      emailVerifiedAt: null,
      createdAt: input.createdAt,
      suspendedReason: null,
      profile: {
        nickname: input.nickname.trim(),
        region: { ...input.region },
        bio: "",
        joinedAt: input.createdAt,
      },
    });
  }

  static restore(state: UserAccountState): UserAccount {
    return new UserAccount(state);
  }

  get id(): string {
    return this.state.id;
  }

  get email(): Email {
    return this.state.email;
  }

  get passwordHash(): PasswordHash {
    return this.state.passwordHash;
  }

  get status(): UserStatus {
    return this.state.status;
  }

  get createdAt(): Date {
    return this.state.createdAt;
  }

  get suspendedReason(): string | null {
    return this.state.suspendedReason;
  }

  get profile(): UserProfileState {
    return { ...this.state.profile, region: this.state.profile.region === null ? null : { ...this.state.profile.region } };
  }

  isEmailVerified(): boolean {
    return this.state.emailVerifiedAt !== null;
  }

  /**
   * Starting a session is allowed for `active` accounts only. A suspended account
   * gets the contract's dedicated 403 (its reason is shown to the owner), while a
   * deleted account gets the non-enumerating 401 so the endpoint never confirms
   * that the address existed.
   */
  assertCanStartSession(): void {
    if (this.state.status === "suspended") {
      throw new ApiError("ACCOUNT_SUSPENDED", SUSPENDED_LOGIN_MESSAGE, this.suspensionDetails());
    }
    if (this.state.status === "deleted") {
      throw new ApiError("INVALID_CREDENTIALS", INVALID_CREDENTIALS_MESSAGE);
    }
  }

  /**
   * Suspended accounts are read-only: every session-bound state change is refused
   * (A-14). Logout and the session-less flows never call this method, which is how
   * the contract's exceptions are expressed structurally rather than by a list of
   * endpoint names.
   */
  assertCanChangeState(): void {
    if (this.state.status === "suspended") {
      throw new ApiError("ACCOUNT_SUSPENDED", SUSPENDED_WRITE_MESSAGE, this.suspensionDetails());
    }
    if (this.state.status === "deleted") {
      throw new ApiError("UNAUTHENTICATED", "로그인이 필요합니다. 다시 로그인해 주세요.");
    }
  }

  /** Replacing the password keeps the account id, status and profile. */
  changePassword(passwordHash: PasswordHash): void {
    this.state = { ...this.state, passwordHash };
  }

  /** Email verification is idempotent: confirming twice keeps the first timestamp. */
  markEmailVerified(at: Date): void {
    if (this.state.emailVerifiedAt !== null) {
      return;
    }
    this.state = { ...this.state, emailVerifiedAt: at };
  }

  suspend(reason: string | null): void {
    this.state = { ...this.state, status: "suspended", suspendedReason: reason };
  }

  /** A pending deletion keeps the row for the 30-day window but cannot be used. */
  markDeleted(): void {
    this.state = { ...this.state, status: "deleted" };
  }

  toState(): UserAccountState {
    return {
      ...this.state,
      profile: { ...this.state.profile, region: this.state.profile.region === null ? null : { ...this.state.profile.region } },
    };
  }

  private suspensionDetails(): Record<string, unknown> | undefined {
    return this.state.suspendedReason === null ? undefined : { suspendedReason: this.state.suspendedReason };
  }
}
