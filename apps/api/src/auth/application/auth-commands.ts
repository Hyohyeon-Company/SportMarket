import type { Email } from "../domain/email";
import type { RegionValue } from "../domain/profile";

/**
 * Input to one use case, already parsed at the transport boundary.
 *
 * These are deliberately not the HTTP DTOs: the application layer must not know
 * that a body arrived as JSON with unknown-field rules, and a future CLI or job
 * can call the same use case.
 */
export interface SignupCommandInput {
  email: Email;
  password: string;
  nickname: string;
  region: RegionValue;
  marketingOptIn: boolean;
}

export interface LoginCommandInput {
  email: Email;
  password: string;
}

export interface PasswordResetRequestInput {
  email: Email;
}

export interface PasswordResetConfirmInput {
  token: string;
  newPassword: string;
}

export interface EmailVerificationConfirmInput {
  token: string;
}

/**
 * Where the request came from, for policies that count attempts per caller.
 * Only the transport layer can supply it; a non-HTTP caller (a job, a test) gets
 * the single shared bucket, which is honest because it has no client address.
 */
export interface RequestOrigin {
  clientIp: string;
}

export const UNSPECIFIED_ORIGIN: RequestOrigin = { clientIp: "unattributed" };
