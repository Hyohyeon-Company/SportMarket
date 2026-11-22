import { API_MESSAGES } from "./api-messages";
import type { ApiErrorCode } from "./api-error";

/**
 * The one place an error code becomes an HTTP status.
 *
 * Codes are domain vocabulary; the contract maps them to statuses (401 vs 403 vs
 * 404, `api-spec-v1.md` §1.2). Keeping the table here means a new domain error
 * cannot advertise a status just by being constructed.
 */
const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  VALIDATION_FAILED: 400,
  PASSWORD_RESET_TOKEN_INVALID: 400,
  EMAIL_VERIFICATION_TOKEN_INVALID: 400,
  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  CSRF_TOKEN_INVALID: 403,
  CSRF_TOKEN_MISSING: 403,
  ACCOUNT_SUSPENDED: 403,
  EMAIL_ALREADY_REGISTERED: 409,
  RATE_LIMITED: 429,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  INTERNAL_ERROR: 500,
};

export function statusForCode(code: ApiErrorCode): number {
  return STATUS_BY_CODE[code];
}

/**
 * A framework error — unknown route, malformed JSON body, wrong method — also has
 * to leave as the contract envelope, so it gets a stable code instead of Express's
 * default HTML page or a bare framework message.
 */
export function codeForStatus(status: number): ApiErrorCode {
  if (status === 400) {
    return "VALIDATION_FAILED";
  }
  if (status === 401) {
    return "UNAUTHENTICATED";
  }
  if (status === 403) {
    return "CSRF_TOKEN_INVALID";
  }
  if (status === 404) {
    return "NOT_FOUND";
  }
  if (status === 405) {
    return "METHOD_NOT_ALLOWED";
  }
  if (status === 409) {
    return "EMAIL_ALREADY_REGISTERED";
  }
  if (status === 429) {
    return "RATE_LIMITED";
  }
  return "INTERNAL_ERROR";
}

export function fallbackMessageFor(code: ApiErrorCode): string {
  switch (code) {
    case "VALIDATION_FAILED":
      return "요청 형식이 올바르지 않습니다. 입력값을 확인해 주세요.";
    case "UNAUTHENTICATED":
      return API_MESSAGES.unauthenticated;
    case "CSRF_TOKEN_INVALID":
      return API_MESSAGES.csrfRejected;
    case "CSRF_TOKEN_MISSING":
      return API_MESSAGES.csrfMissing;
    case "INVALID_CREDENTIALS":
      return API_MESSAGES.invalidCredentials;
    case "RATE_LIMITED":
      return API_MESSAGES.rateLimited;
    case "ACCOUNT_SUSPENDED":
      return "이용이 정지된 계정입니다. 조회만 가능합니다.";
    case "EMAIL_ALREADY_REGISTERED":
      return "이미 가입된 이메일입니다. 로그인하거나 비밀번호를 재설정해 주세요.";
    case "PASSWORD_RESET_TOKEN_INVALID":
      return "재설정 링크가 만료되었거나 이미 사용되었습니다. 다시 요청해 주세요.";
    case "EMAIL_VERIFICATION_TOKEN_INVALID":
      return "인증 링크가 만료되었거나 이미 사용되었습니다. 재발송을 요청해 주세요.";
    case "NOT_FOUND":
      return "요청한 정보를 찾을 수 없습니다.";
    case "METHOD_NOT_ALLOWED":
      return "지원하지 않는 요청 방식입니다.";
    case "INTERNAL_ERROR":
      return API_MESSAGES.internalError;
    default:
      return API_MESSAGES.internalError;
  }
}
