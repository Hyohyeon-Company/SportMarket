import { validationFailed } from "../../common/api-error";
import { Email, emailFieldIssues } from "../domain/email";
import type { FieldIssue } from "../../common/field-issue";
import { passwordFieldIssues } from "../domain/password";
import { Region, nicknameFieldIssues, regionFieldIssues, type RegionValue } from "../domain/profile";

/**
 * Request parsing at the transport boundary.
 *
 * The scaffold has no `class-validator`, and adding one would put a decorator
 * framework between the contract and its rules. These parsers therefore produce
 * the contract's own 400 shape (`VALIDATION_FAILED` + `details.fields[]`) with
 * every issue for the request at once — the S10 form highlights more than one
 * field at a time (duplicate email aside, which is a 409).
 */
export interface SignupCommand {
  email: Email;
  password: string;
  nickname: string;
  region: RegionValue;
  marketingOptIn: boolean;
}

export interface LoginCommand {
  email: Email;
  password: string;
}

export interface PasswordResetRequestCommand {
  email: Email;
}

export interface PasswordResetConfirmCommand {
  token: string;
  newPassword: string;
}

export interface EmailVerificationConfirmCommand {
  token: string;
}

const TOKEN_MIN_LENGTH = 16;
const TOKEN_MAX_LENGTH = 512;

export function parseSignupBody(body: unknown): SignupCommand {
  const record = asRecord(body);
  const issues: FieldIssue[] = [
    ...unknownFieldIssues(record, ["email", "password", "nickname", "region", "agreements"]),
    ...emailFieldIssues(record.email),
    ...passwordFieldIssues(record.password),
    ...nicknameFieldIssues(record.nickname),
    ...regionFieldIssues(record.region),
    ...agreementIssues(record.agreements),
  ];
  if (issues.length > 0) {
    throw validationFailed(issues);
  }
  const marketing = (record.agreements as Record<string, unknown>).marketing;
  return {
    email: Email.parse(record.email as string),
    password: record.password as string,
    nickname: (record.nickname as string).trim(),
    region: Region.parse(record.region).toValue(),
    marketingOptIn: marketing === true,
  };
}

export function parseLoginBody(body: unknown): LoginCommand {
  const record = asRecord(body);
  const issues: FieldIssue[] = [...unknownFieldIssues(record, ["email", "password"]), ...emailFieldIssues(record.email)];
  // Login only compares credentials, so it must not apply the signup password
  // policy: an existing account whose password predates a policy change can still sign in.
  const password = record.password;
  if (password === undefined || password === null || password === "") {
    issues.push({ path: "password", code: "required", message: "비밀번호를 입력해 주세요." });
  } else if (typeof password !== "string") {
    issues.push({ path: "password", code: "type", message: "비밀번호는 문자열이어야 합니다." });
  } else if (password.length > 128) {
    issues.push({ path: "password", code: "max_length", message: "비밀번호는 128자 이내로 입력해 주세요." });
  }
  if (issues.length > 0) {
    throw validationFailed(issues);
  }
  return { email: Email.parse(record.email as string), password: record.password as string };
}

export function parsePasswordResetRequestBody(body: unknown): PasswordResetRequestCommand {
  const record = asRecord(body);
  const issues: FieldIssue[] = [...unknownFieldIssues(record, ["email"]), ...emailFieldIssues(record.email)];
  if (issues.length > 0) {
    throw validationFailed(issues);
  }
  return { email: Email.parse(record.email as string) };
}

export function parsePasswordResetConfirmBody(body: unknown): PasswordResetConfirmCommand {
  const record = asRecord(body);
  const issues: FieldIssue[] = [
    ...unknownFieldIssues(record, ["token", "newPassword"]),
    ...tokenFieldIssues(record.token),
    ...passwordFieldIssues(record.newPassword, "newPassword"),
  ];
  if (issues.length > 0) {
    throw validationFailed(issues);
  }
  return { token: (record.token as string).trim(), newPassword: record.newPassword as string };
}

export function parseEmailVerificationConfirmBody(body: unknown): EmailVerificationConfirmCommand {
  const record = asRecord(body);
  const issues: FieldIssue[] = [...unknownFieldIssues(record, ["token"]), ...tokenFieldIssues(record.token)];
  if (issues.length > 0) {
    throw validationFailed(issues);
  }
  return { token: (record.token as string).trim() };
}

function asRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw validationFailed([{ path: "body", code: "required", message: "요청 본문이 필요합니다." }]);
  }
  return body as Record<string, unknown>;
}

function unknownFieldIssues(record: Record<string, unknown>, allowed: readonly string[]): FieldIssue[] {
  const allowedSet = new Set(allowed);
  return Object.keys(record)
    .filter((key) => !allowedSet.has(key))
    .map((key) => ({ path: key, code: "unknown_field", message: "이 요청에서 사용하지 않는 필드입니다." }));
}

function tokenFieldIssues(value: unknown, path = "token"): FieldIssue[] {
  if (value === undefined || value === null || value === "") {
    return [{ path, code: "required", message: "링크의 토큰이 필요합니다." }];
  }
  if (typeof value !== "string") {
    return [{ path, code: "type", message: "토큰은 문자열이어야 합니다." }];
  }
  const trimmed = value.trim();
  if (trimmed.length < TOKEN_MIN_LENGTH) {
    return [{ path, code: "min_length", message: "토큰이 올바르지 않습니다." }];
  }
  if (trimmed.length > TOKEN_MAX_LENGTH) {
    return [{ path, code: "max_length", message: "토큰이 올바르지 않습니다." }];
  }
  return [];
}

function agreementIssues(value: unknown): FieldIssue[] {
  if (value === undefined || value === null) {
    return [{ path: "agreements", code: "required", message: "필수 약관에 동의해 주세요." }];
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    return [{ path: "agreements", code: "type", message: "동의 항목 형식이 올바르지 않습니다." }];
  }
  const record = value as Record<string, unknown>;
  const issues: FieldIssue[] = unknownFieldIssues(record, ["termsOfService", "privacyPolicy", "marketing"]);
  if (record.termsOfService !== true) {
    issues.push({ path: "agreements.termsOfService", code: "required", message: "이용약관 동의가 필요합니다." });
  }
  if (record.privacyPolicy !== true) {
    issues.push({ path: "agreements.privacyPolicy", code: "required", message: "개인정보 처리방침 동의가 필요합니다." });
  }
  if (record.marketing !== undefined && typeof record.marketing !== "boolean") {
    issues.push({ path: "agreements.marketing", code: "type", message: "마케팅 동의는 true 또는 false여야 합니다." });
  }
  return issues;
}
