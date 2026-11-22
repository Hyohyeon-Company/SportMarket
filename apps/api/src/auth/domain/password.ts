import { ApiError } from "../../common/api-error";
import type { FieldIssue } from "../../common/field-issue";

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/**
 * Signup and password-reset share one password policy: 8..128 characters and at
 * least one non-whitespace character (AC-01-3 plus the 2026-11-18 validation
 * detail: a whitespace-only value is refused). Login deliberately does NOT use
 * this policy — the contract only compares stored credentials there, so an older
 * account whose password no longer satisfies today's policy can still sign in.
 */
export function passwordFieldIssues(value: unknown, path = "password"): FieldIssue[] {
  if (value === undefined || value === null || value === "") {
    return [{ path, code: "required", message: "비밀번호를 입력해 주세요." }];
  }
  if (typeof value !== "string") {
    return [{ path, code: "type", message: "비밀번호는 문자열이어야 합니다." }];
  }
  if (value.length < PASSWORD_MIN_LENGTH) {
    return [{ path, code: "min_length", message: "비밀번호는 8자 이상이어야 합니다." }];
  }
  if (value.length > PASSWORD_MAX_LENGTH) {
    return [{ path, code: "max_length", message: "비밀번호는 128자 이내로 입력해 주세요." }];
  }
  if (!/\S/.test(value)) {
    return [{ path, code: "pattern", message: "비밀번호에 공백이 아닌 문자를 포함해 주세요." }];
  }
  return [];
}

/**
 * A stored password digest. The plaintext never exists beyond the hashing call,
 * is never logged and is never part of an API response (`writeOnly` in the spec).
 */
export class PasswordHash {
  private constructor(readonly value: string) {}

  static fromStorage(value: string): PasswordHash {
    if (value.trim() === "") {
      throw new ApiError("INTERNAL_ERROR", "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    }
    return new PasswordHash(value);
  }
}
