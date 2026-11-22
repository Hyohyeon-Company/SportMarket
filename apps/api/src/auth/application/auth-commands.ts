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
