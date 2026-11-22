import { ApiError } from "../../common/api-error";
import type { FieldIssue } from "../../common/field-issue";

export const EMAIL_MAX_LENGTH = 254;

/**
 * Deliberately not the full RFC 5322 grammar: the contract declares
 * `format: email` on an input the client controls, and a permissive shape check
 * plus the length cap is what the browser form produces (S10). Real deliverability
 * is proven by the verification mail, not by a regex.
 */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function emailFieldIssues(value: unknown, path = "email"): FieldIssue[] {
  if (value === undefined || value === null || value === "") {
    return [{ path, code: "required", message: "이메일을 입력해 주세요." }];
  }
  if (typeof value !== "string") {
    return [{ path, code: "type", message: "이메일은 문자열이어야 합니다." }];
  }
  const normalized = value.trim().toLowerCase();
  if (normalized.length > EMAIL_MAX_LENGTH) {
    return [{ path, code: "max_length", message: "이메일은 254자 이내로 입력해 주세요." }];
  }
  if (!EMAIL_SHAPE.test(normalized)) {
    return [{ path, code: "format", message: "이메일 형식이 올바르지 않습니다." }];
  }
  return [];
}

/**
 * Email value object. Identity of an account is the normalized address, so two
 * spellings that differ only in case or surrounding spaces are the same account
 * (AC-01-2 duplicate detection).
 */
export class Email {
  private constructor(readonly value: string) {}

  static parse(raw: string): Email {
    const issues = emailFieldIssues(raw);
    const first = issues[0];
    if (first !== undefined) {
      throw new ApiError("VALIDATION_FAILED", "입력값을 확인해 주세요.", { fields: issues });
    }
    return new Email(raw.trim().toLowerCase());
  }

  equals(other: Email): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
