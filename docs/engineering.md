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
