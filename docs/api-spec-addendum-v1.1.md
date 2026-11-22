# API spec addendum v1.1 — F-01 auth contract extensions

- Date: 2026-11-22 (KST)
- Scope: the four gaps the F-01 implementation reported as `OPEN-1`..`OPEN-4`
- Authority: Leader decision `f01-auth-contract-decisions-v1`
  (`artifacts/decisions/secondhand-market/f01-auth-contract-decisions-v1.md`, sha256
  `4a45714391e1ee27c10b4dc1e59cf3235116c76e767e05f61488dace00f0b67f`)
- Status: **extension**, not a rewrite. The pinned `api-spec-v1` (sha256
  `b79842a8…4986`) is unchanged; nothing here contradicts it. Where a decision
  could be read two ways, the pinned contract wins and the reading is stated below.

## D-1 CSRF token carrier (was OPEN-1)

Pinned contract: `securitySchemes.csrfToken` / `parameters.CsrfToken` require the
`X-CSRF-Token` header on `POST`/`PATCH`/`DELETE`, but the `Session` schema is
`additionalProperties: false` and has no token field, so the value had no defined
transport.

Extension:

| Element | Value |
| --- | --- |
| Cookie name | `sm_csrf` |
| Attributes | `HttpOnly=false` (the SPA must read it), `Secure`, `SameSite=Lax`, `Path=/`, `Max-Age` equal to the session lifetime |
| Header | `X-CSRF-Token`, same value as the cookie (double submit) |
| Required on | state-changing requests only (`POST`/`PATCH`/`DELETE`); never on `GET`/`HEAD` |
| Missing cookie or header | `403` `CSRF_TOKEN_MISSING` |
| Cookie and header differ, value outside 16..256 characters, or value does not match the session's digest | `403` `CSRF_TOKEN_INVALID` |

`CSRF_TOKEN_MISSING` is a new stable code in the extension; it still matches the
`Error.code` pattern `^[A-Z][A-Z0-9_]*$`. Clients that only branch on
`CSRF_TOKEN_INVALID` keep working for mismatches, and a missing token is a distinct
condition (cookie wiring / first load) worth its own branch.

## D-2 Session lifetime (was OPEN-2)

- Absolute `Max-Age=604800` (7 days). No sliding renewal; a request never extends a
  session. Sliding renewal is deferred to the front-end session-UX card.
- A protected request whose session is expired or revoked answers
  `401 UNAUTHENTICATED` and the response expires both cookies (`Max-Age=0`).
- `GET /auth/session` keeps the pinned shape: `200` with `authenticated:false` for
  an anonymous visitor or a stale cookie, because the pinned operation defines that
  response explicitly. It expires the stale cookie it was given and sends no
  `Set-Cookie` when no cookie was presented. Protected endpoints are where D-2's
  `401` applies.

## D-3 Email verification token (was OPEN-3)

- Valid 24 hours, single use. A second confirm with a spent or expired token is
  `400 EMAIL_VERIFICATION_TOKEN_INVALID`.
- A resend invalidates any unused token for the same purpose, so at most one link is
  valid at a time.
- The response for a resend stays `202` even for an already verified account; the
  flag is idempotent and the stale banner is the client's business.

## D-4 Rate limits for operations the pinned spec documents `429` for (was OPEN-4)

| Operation | Key | Limit | On exceed |
| --- | --- | --- | --- |
| `POST /auth/login` | normalized email + client IP | 5/minute | `429 RATE_LIMITED` + `Retry-After` |
| `POST /auth/signup` | client IP | 5/minute | `429 RATE_LIMITED` + `Retry-After` |
| `POST /auth/password-reset` | normalized email | 3/minute | `429 RATE_LIMITED` + `Retry-After` |
| `POST /auth/password-reset` | client IP | 10/minute | `429 RATE_LIMITED` + `Retry-After` |
| `POST /auth/email-verification` (resend) | normalized email | 3/minute | `429 RATE_LIMITED` + `Retry-After` |

`Retry-After` is seconds (`parameters.RetryAfter`), at least `1`. The password-reset
operation is counted twice on purpose: the per-address limit protects one inbox,
the per-source limit stops one client cycling through many addresses. A window is a
fixed 60 seconds.

## Related behaviour recorded here because it changes observable responses

- **Login timing**: an unknown address still runs a password-hash comparison
  against a decoy digest, so the response time does not reveal registration. The
  body and status stay the pinned generic `401 INVALID_CREDENTIALS`.
- **`agreements.marketing`** is validated at signup and then discarded in this
  round. Persisting consent (value, timestamp, terms version) is a follow-up card;
  no endpoint exposes consent state yet.

## Operational note (not a contract change)

Per-source limits use the client address the HTTP adapter reports. Behind a reverse
proxy the deployment must configure `trust proxy`; otherwise every request shares
the proxy's address and the per-source limits behave as one bucket. The in-memory
limiter also counts per process, so a multi-instance deployment needs a shared
counter (MySQL or Redis) in a later card.
