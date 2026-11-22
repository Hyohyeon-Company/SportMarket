import type { FieldIssue } from "./field-issue";

/**
 * The only error shape the contract allows (`components.schemas.Error`).
 *
 * `code` is the stable branch (`^[A-Z][A-Z0-9_]*$`) and `message` is the Korean
 * sentence the client may render as-is. HTTP status is deliberately NOT stored
 * here: the transport layer owns that mapping (`http-error-map.ts`), so domain and
 * application code never depend on NestJS or HTTP.
 *
 * The type lives in `src/common` because the envelope is contract-wide — every
 * feature raises it — while the codes below are the ones F-01 can produce today.
 */
export type ApiErrorCode =
  | "VALIDATION_FAILED"
  | "UNAUTHENTICATED"
  | "CSRF_TOKEN_INVALID"
  | "CSRF_TOKEN_MISSING"
  | "ACCOUNT_SUSPENDED"
  | "INVALID_CREDENTIALS"
  | "EMAIL_ALREADY_REGISTERED"
  | "PASSWORD_RESET_TOKEN_INVALID"
  | "EMAIL_VERIFICATION_TOKEN_INVALID"
  | "RATE_LIMITED"
  | "NOT_FOUND"
  | "METHOD_NOT_ALLOWED"
  | "INTERNAL_ERROR";

export class ApiError extends Error {
  readonly code: ApiErrorCode;

  readonly details: Record<string, unknown> | undefined;

  constructor(code: ApiErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.details = details;
  }
}

/** `VALIDATION_FAILED` for a non-empty issue list. */
export function validationFailed(issues: FieldIssue[]): ApiError {
  return new ApiError("VALIDATION_FAILED", "입력값을 확인해 주세요.", { fields: issues });
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}
