/**
 * Auth policy constants in one place, each tied to where it comes from.
 *
 * Contract-fixed values are quoted from the pinned spec. Values the pinned spec
 * leaves open (`OPEN-1`..`OPEN-4` in the F-01 implementation handoff) are now
 * fixed by Leader decision:
 * `artifacts/decisions/secondhand-market/f01-auth-contract-decisions-v1.md`, D-1..D-4,
 * recorded as a contract extension in `docs/api-spec-addendum-v1.1.md`. They are
 * approved policy here, not implementation guesses, so the pinned contract itself
 * is unchanged and no constant below is presented as a business rule the team
 * invented.
 */
export const AUTH_POLICY = {
  /** AC-01-6 / `POST /auth/password-reset/confirm`: single use, 30 minutes. */
  passwordResetTokenTtlSeconds: 30 * 60,

  /**
   * D-2: absolute 7 days, no sliding renewal, so a stolen cookie has a bounded
   * life. A stale or revoked session is `401 UNAUTHENTICATED` and its cookies are
   * expired. Sliding renewal is a front-end session-UX question for a later card.
   */
  sessionTtlSeconds: 7 * 24 * 60 * 60,

  /** D-3: the mailed verification link works for 24 hours and only once. */
  emailVerificationTokenTtlSeconds: 24 * 60 * 60,

  /**
   * D-4: thresholds for the operations the pinned spec documents `429` for without
   * a number. Keys say which dimension is counted, because that is the part a
   * reader cannot infer from the number alone.
   */
  rateLimits: {
    /** 5/minute per normalized email + client IP. */
    login: { windowSeconds: 60, maxAttempts: 5 },
    /** 5/minute per client IP: a signup flood is a source problem, not an address one. */
    signup: { windowSeconds: 60, maxAttempts: 5 },
    /** 3/minute per normalized email: stops a reset-mail flood at one inbox. */
    passwordResetPerEmail: { windowSeconds: 60, maxAttempts: 3 },
    /** 10/minute per client IP: stops one source cycling through many addresses. */
    passwordResetPerIp: { windowSeconds: 60, maxAttempts: 10 },
    /** 3/minute per normalized email for the verification resend. */
    emailVerificationPerEmail: { windowSeconds: 60, maxAttempts: 3 },
  },

  /**
   * D-1: the CSRF value rides in a client-readable cookie because the contract's
   * `Session` body is `additionalProperties: false` and carries no token field.
   * The SPA echoes it in `X-CSRF-Token` (double submit).
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
