/**
 * Auth policy constants in one place, each tied to where it comes from.
 *
 * Contract-fixed values are quoted from the pinned spec. Values the contract does
 * not fix are marked `OPEN` with the reason: they are operational defaults chosen
 * to be safe, and they are reported back to Leader instead of being presented as
 * approved business rules.
 */
export const AUTH_POLICY = {
  /** AC-01-6 / `POST /auth/password-reset/confirm`: single use, 30 minutes. */
  passwordResetTokenTtlSeconds: 30 * 60,

  /** AC-01-5 / `responses.TooManyRequests`: 5 attempts per account per minute. */
  loginRateLimit: { windowSeconds: 60, maxAttempts: 5 },

  /**
   * OPEN-2: the contract does not state a session lifetime or whether it slides.
   * Absolute 7 days, no sliding renewal, so a stolen cookie has a bounded life.
   */
  sessionTtlSeconds: 7 * 24 * 60 * 60,

  /**
   * OPEN-3: `POST /auth/email-verification/confirm` documents only "expired", not
   * a window. 24 hours keeps the mailed link usable for a day.
   */
  emailVerificationTokenTtlSeconds: 24 * 60 * 60,

  /**
   * OPEN-4: `429 RATE_LIMITED` is documented for signup and password reset without
   * a numeric threshold (only login is fixed at 5/min). The same conservative
   * window is applied per address so the documented response is reachable.
   */
  addressRateLimit: { windowSeconds: 60, maxAttempts: 5 },

  /**
   * OPEN-5: the spec says the CSRF token is "issued together with the session"
   * (`securitySchemes.csrfToken`) but the `Session` body is
   * `additionalProperties: false` and carries no token field, so the carrier must
   * be a client-readable cookie. That cookie name is not in the contract.
   */
  cookies: {
    session: "sm_session",
    csrf: "sm_csrf",
  },

  /** CSRF header per `parameters.CsrfToken`. */
  csrfHeaderName: "X-CSRF-Token",
  csrfTokenMinLength: 16,
  csrfTokenMaxLength: 256,
} as const;
