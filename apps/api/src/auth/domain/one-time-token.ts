import { ApiError } from "../../common/api-error";

/**
 * The two single-use, time-boxed tokens the auth flows issue. They share one
 * lifecycle (issued → consumed, with an expiry and a purpose), so one aggregate
 * models both instead of two near-identical entities diverging over time.
 */
export type OneTimeTokenPurpose = "password_reset" | "email_verification";

export interface OneTimeTokenState {
  id: string;
  userId: string;
  purpose: OneTimeTokenPurpose;
  /** SHA-256 of the token that was mailed. Only the digest is stored. */
  tokenHash: string;
  issuedAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
}

export const ONE_TIME_TOKEN_ERRORS: Record<OneTimeTokenPurpose, { code: "PASSWORD_RESET_TOKEN_INVALID" | "EMAIL_VERIFICATION_TOKEN_INVALID"; message: string }> = {
  password_reset: {
    code: "PASSWORD_RESET_TOKEN_INVALID",
    message: "재설정 링크가 만료되었거나 이미 사용되었습니다. 다시 요청해 주세요.",
  },
  email_verification: {
    code: "EMAIL_VERIFICATION_TOKEN_INVALID",
    message: "인증 링크가 만료되었거나 이미 사용되었습니다. 재발송을 요청해 주세요.",
  },
};

/**
 * One-time token aggregate.
 *
 * `consume` is the only way to mark it used, and it is the operation that refuses
 * a token which is expired, already used, or of the wrong purpose — so a
 * password-reset link can never confirm an email address.
 */
export class OneTimeToken {
  private constructor(private state: OneTimeTokenState) {}

  static issue(input: {
    id: string;
    userId: string;
    purpose: OneTimeTokenPurpose;
    tokenHash: string;
    issuedAt: Date;
    expiresAt: Date;
  }): OneTimeToken {
    return new OneTimeToken({ ...input, consumedAt: null });
  }

  static restore(state: OneTimeTokenState): OneTimeToken {
    return new OneTimeToken({ ...state });
  }

  get id(): string {
    return this.state.id;
  }

  get userId(): string {
    return this.state.userId;
  }

  get purpose(): OneTimeTokenPurpose {
    return this.state.purpose;
  }

  get tokenHash(): string {
    return this.state.tokenHash;
  }

  get expiresAt(): Date {
    return this.state.expiresAt;
  }

  get consumedAt(): Date | null {
    return this.state.consumedAt;
  }

  isUsable(now: Date, purpose: OneTimeTokenPurpose): boolean {
    return this.state.consumedAt === null && this.state.purpose === purpose && now.getTime() < this.state.expiresAt.getTime();
  }

  /**
   * Refuses an unusable token with the message the matching endpoint documents.
   * The error is raised before any account state changes.
   */
  consume(now: Date, purpose: OneTimeTokenPurpose): void {
    if (!this.isUsable(now, purpose)) {
      const error = ONE_TIME_TOKEN_ERRORS[purpose];
      throw new ApiError(error.code, error.message);
    }
    this.state = { ...this.state, consumedAt: now };
  }

  toState(): OneTimeTokenState {
    return { ...this.state };
  }
}
