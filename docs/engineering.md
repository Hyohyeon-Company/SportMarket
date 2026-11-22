# Engineering baseline

Use Node.js 24 LTS, an exactly pinned pnpm version, a committed lockfile and a small monorepo (`apps/*`, `packages/*`). MySQL is the database and Docker the runtime packaging. Select framework/ORM/auth/test libraries to fit the actual product; record short decisions here as they are made. Prefer existing role expertise in TypeScript, NestJS and React without forcing unnecessary architecture.

Source editing, execution, builds and tests run on the team's separate server PC. Development/CI have no production data or credentials. Production runs immutable images; each project has separate MySQL and Prometheus/Grafana/Loki instances, credentials, volumes and networks.

Implement real root package scripts matching `.team/ci.json`. The CI contract fails when scripts, tool pins or the lockfile are missing. Integration, E2E and operations exceptions require a concrete inapplicability reason reviewed with the PR. Domain rules, authorization denial and real database behavior need meaningful verification when applicable. Never insert success-only placeholder scripts.

GitHub Actions is the pipeline orchestrator; local CI needs disposable VM isolation and a separately trusted deployment path. Workflow/CODEOWNERS examples remain inactive until real identities, immutable action SHAs and isolation are verified. A runner label is not an isolation boundary. External PRs do not automatically run on local infrastructure.

Protected main merge by the implementer triggers CI then automatic deployment within the approved project/environment. Deploy only the tested main commit's immutable images, with staging smoke, migration compatibility, health checks and serialized promotions. A main CI failure prevents deployment. Monitoring incidents allow diagnosis/reporting first; user instruction is required to begin repairs.

## Container gate (required once the project has a compose stack)

Unit tests cannot see the failures that stop a deployment: a `COPY` that inherits a restrictive
umask, a missing runtime permission, a container that starts and exits, a service that never
becomes healthy. `scripts/ci-container-gate.mjs` proves the image boots and answers a real
request, and it is repository-agnostic:

```json
"test:operations": "node scripts/ci-container-gate.mjs"
```

Environment knobs: `GATE_DOCKER` (docker CLI or a wrapper when the caller has no socket access), `GATE_COMPOSE` (default `docker-compose.yml`), `GATE_HEALTH_URL`,
`GATE_HEALTH_TIMEOUT_MS`, `GATE_ENV` (space separated `KEY=VALUE` for compose),
`GATE_STRICT_MODES` (default on: every tracked file is `chmod 600` before the build and the real
modes are restored afterwards), `GATE_ARTIFACTS` (failure logs), `GATE_KEEP=1` (leave the stack
up for inspection).

Why strict modes is the default: a Dockerfile whose `COPY` does not normalise modes produces an
image that only works when the build context happens to be world-readable. The gate makes that
condition explicit, so the defect fails in CI instead of on the target host. When a project adds a
database, extend its health URL to a query that proves the data layer answered, not just the
process.

## Stack decisions (scaffold v1)

Framework and tool choices for the initial scaffold. Versions are the declared
ranges in each `package.json`; the first `pnpm install` card commits
`pnpm-lock.yaml` and records the exact resolved versions here.

| Area | Choice | Why |
| --- | --- | --- |
| Runtime/tooling | Node.js 24 LTS, pnpm 12.18.0 (`packageManager`), TypeScript 5.9 | fixed by team policy; one compiler version across the monorepo |
| API | NestJS 11 on the Express platform, CommonJS output | role default; decorator/DI model fits the module boundaries the domain cards need |
| Web | React 19 + Vite 7 (`@vitejs/plugin-react` 5) | static SPA for the approved screens; no SSR requirement in scope |
| Unit tests | Vitest 3 for `apps/api` and `apps/web` | one runner for both packages, no ts-jest/Babel duplication. Nest providers are plain TypeScript, and the web shell is asserted through `react-dom/server`, so no DOM emulator is required |
| Lint | ESLint 9 flat config at the repository root, `typescript-eslint` 8 | one configuration for `apps/*` and `packages/*`; each package runs `eslint .` and resolves the root config by walking up |
| Shared types | `@sportmarket/shared`, declarations only | mirrors the pinned API contract; the build emits `.d.ts` only, so the package cannot accidentally ship runtime behaviour |

### Root scripts

`lint`, `typecheck` and `build` fan out with `pnpm -r run`. `test:unit` is scoped
to the two applications with `--filter`, because `packages/shared` is type-only
and has no runnable unit under test. No script uses `--if-present`, and no script
returns success unconditionally: every package script it invokes exists and runs
a real tool.

### Design tokens

`apps/web/src/tokens.css` is a byte-identical copy of the team design system
`tokens.css` v0.2.1
(sha256 `cccc92d99c36ffade59ee0c639ba5a654e0eda1d51c278de5ab124c15217fea9`), as the
design handoff directs. Change token values only in the design system and
re-copy; do not edit the copy in place. `apps/web/src/styles.css` references
`var(--…)` only and contains no literal colour, size, radius or shadow.

### Known gaps in this scaffold

Deliberate, and owned by later cards rather than this one:

- No `pnpm-lock.yaml` yet. The first install card commits it; until then
  `node .team/run-ci.mjs --validate` fails on the missing lockfile, and the
  dependency ranges above are unverified by an actual resolution.
- `.team/ci.json` declares eight checks. Only `lint`, `typecheck`, `test:unit`
  and `build` have real scripts here; `test:integration`, `test:e2e`,
  `test:security` and `test:operations` (the container gate) arrive with the
  cards that create their subjects. Until every check exists the CI contract
  cannot validate, and `.github/workflows/ci.yml.example` stays inactive.
- `packages/shared` has no consumer yet; wiring it into the first real API call
  belongs to that card.
- `apps/api` has no database connection, migration, authentication or `/media`
  route, and `apps/web` performs no data fetching. Both are feature-card scope.
- No CI ran: the workflow file is an inactive example and this repository has no
  runner bound.

## Auth decisions (F-01 implementation card)

F-01 (`/auth/*`) is the first behaviour-bearing feature in `apps/api`. These are
the reversible technical choices the contract forced, recorded so the next card
does not have to rediscover them. Each is a specialist decision, not an approved
business rule change.

| Area | Choice | Why |
| --- | --- | --- |
| Layer split | `apps/api/src/auth/{domain,application,ports,adapters,presentation}` | the auth rules (suspension, single-use tokens, session validity) stay usable without NestJS, and the MySQL card swaps an adapter instead of a rule |
| Password hashing | `node:crypto` scrypt, per-password salt, parameters embedded in the stored value | no hashing dependency may be installed in this card, and scrypt is a memory-hard KDF suitable for credentials. `maxmem` is raised because the default limit sits at the edge for `N=16384, r=8` |
| Session and token storage | SHA-256 digests of opaque random values; the plaintext lives only in the cookie or the mailed link | a database read cannot be replayed as a session or used to reset a password |
| Request validation | hand-written parsers in `auth/dto` returning the contract's `details.fields[]` | the scaffold has no `class-validator`; the pinned schema is the source of truth, and one parser reports every invalid field at once |
| CSRF | readable `sm_csrf` cookie + required `X-CSRF-Token` header holding the same value (double submit), compared against the session's digest | the contract's `Session` body is `additionalProperties: false`, so the token cannot ride in the response body. Leader decision D-1 fixes the cookie name, attributes and the `CSRF_TOKEN_MISSING` / `CSRF_TOKEN_INVALID` split; recorded in `docs/api-spec-addendum-v1.1.md` |
| Errors | `ApiError` in `src/common` plus one global `ApiExceptionFilter` | every route answers with the single `{code, message, details?}` envelope, including framework 404/400s |
| API prefix | `app.setGlobalPrefix("api/v1")`, `GET /health` excluded | the contract's `servers` entry is `/api/v1`; the liveness probe is operational rather than contractual, so its path stays stable |
| Shared types | `apps/api` declares the contract types it needs locally for now | `@sportmarket/shared` points `types` at `dist/index.d.ts`, which does not exist until `pnpm build`, while the CI contract runs `typecheck` before `build`; importing it now would fail typecheck. Wiring it belongs to the card that also settles that build order |

Depth of this implementation: `apps/api/src/auth` (domain, application, ports,
in-memory adapters, DTO parsers, guards, controller) and `apps/api/src/common`
(envelope, error mapping, filter).

Deliberately absent, as the card scopes them out: MySQL repositories and
migrations, a real mail transport, and a rate-limit store shared between
processes. The in-memory adapters therefore lose accounts and sessions on
restart, and the fixed-window limiter counts per process.

Thresholds the pinned contract leaves open — the CSRF carrier (D-1), session
lifetime (D-2), the verification-token window (D-3) and the non-login `429`
limits (D-4) — were decided by Leader on 2026-11-22
(`artifacts/decisions/secondhand-market/f01-auth-contract-decisions-v1.md`) and
are recorded as a contract extension in `docs/api-spec-addendum-v1.1.md`. They are
constants in `auth/domain/auth-policy.ts` citing the decision, not implementation
defaults, and the pinned `api-spec-v1` itself is unchanged.

Known limits of this implementation, left for later cards on purpose:
`agreements.marketing` is validated and then dropped — the consent record (value,
timestamp, terms version) is a follow-up card, so nothing can read consent state
yet; per-source rate-limit keys use the address Express reports, so a deployment
behind a proxy must configure `trust proxy` before those limits mean what they
say; and the in-memory limiter counts per process, so multiple instances each get
their own window.
