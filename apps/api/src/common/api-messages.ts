/**
 * User-facing contract messages that several features share verbatim.
 *
 * They are contract text (`components.responses.*` examples), not translations of
 * an internal error, so they live next to the envelope in `common` rather than in
 * one feature's vocabulary.
 */
export const API_MESSAGES = {
  validationFailed: "입력값을 확인해 주세요.",
  unauthenticated: "로그인이 필요합니다. 다시 로그인해 주세요.",
  csrfRejected: "요청을 확인할 수 없습니다. 페이지를 새로 고친 뒤 다시 시도해 주세요.",
  csrfMissing: "요청 확인 토큰이 없습니다. 페이지를 새로 고친 뒤 다시 시도해 주세요.",
  rateLimited: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
  invalidCredentials: "이메일 또는 비밀번호가 올바르지 않습니다.",
  internalError: "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
} as const;
