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
