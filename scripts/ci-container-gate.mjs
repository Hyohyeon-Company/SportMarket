#!/usr/bin/env node
/**
 * Generic container gate for application repositories.
 *
 * CI that only runs lint/unit tests cannot see the failures that actually stop a
 * deployment: a COPY that inherits a restrictive umask, a missing runtime
 * permission, a container that starts and immediately dies, a service that never
 * becomes healthy. This gate proves the image boots and answers a real request.
 *
 * It is deliberately repository-agnostic. Wire it into the project's CI contract
 * once the repo has a compose stack:
 *
 *   "test:operations": "node scripts/ci-container-gate.mjs"
 *
 * Environment:
 *   GATE_DOCKER         docker CLI to call (default: docker). Point it at a wrapper
 *                       when the caller has no direct socket access.
 *   GATE_COMPOSE        compose file (default: docker-compose.yml)
 *   GATE_PROJECT        compose project name (default: ci-gate-<pid>)
 *   GATE_HEALTH_URL     URL that must answer 2xx (default: http://localhost:3000/api/health)
 *   GATE_HEALTH_TIMEOUT_MS  total poll budget (default: 120000)
 *   GATE_STRICT_MODES   "1" (default) chmod every tracked file to 0600 before the
 *                       build and restore the real modes afterwards, so a COPY
 *                       that does not normalise modes fails here, not in prod
 *   GATE_ENV            space separated KEY=VALUE pairs exported for compose
 *   GATE_ARTIFACTS      directory for logs (default: ci-container-logs)
 *   GATE_KEEP           "1" leaves the stack running for a human to inspect
 *
 * Exit codes: 0 pass, 1 gate failed, 2 configuration/tooling problem.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, statSync, writeFileSync } from 'node:fs';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const DOCKER = process.env.GATE_DOCKER || 'docker';
const COMPOSE = process.env.GATE_COMPOSE || 'docker-compose.yml';
const PROJECT = process.env.GATE_PROJECT || `ci-gate-${process.pid}`;
const HEALTH = process.env.GATE_HEALTH_URL || 'http://localhost:3000/api/health';
const TIMEOUT = Number(process.env.GATE_HEALTH_TIMEOUT_MS || 120_000);
const STRICT = (process.env.GATE_STRICT_MODES ?? '1') !== '0';
const ARTIFACTS = process.env.GATE_ARTIFACTS || 'ci-container-logs';
const KEEP = process.env.GATE_KEEP === '1';

const log = message => console.log(`[ci-container] ${message}`);
const fail = message => { console.error(`[ci-container] FAIL ${message}`); process.exit(1); };

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', stdio: options.capture ? 'pipe' : 'inherit', ...options });
  if (result.error) throw result.error;
  return result;
}

function compose(args, options) {
  return run(DOCKER, ['compose', '-f', COMPOSE, '-p', PROJECT, ...args], options);
}

function trackedModes() {
  // The git index owns the real mode (100644/100755); a previous interrupted
  // run may have left files at 0600, so the filesystem must never be the source
  // of truth for restoring them.
  const result = run('git', ['ls-files', '-s', '-z'], { capture: true });
  if (result.status !== 0) return [];
  const entries = [];
  for (const item of (result.stdout || '').split('\0').filter(Boolean)) {
    const [meta, path] = item.split('\t');
    if (!meta || !path) continue;
    const indexMode = meta.split(' ')[0];
    if (indexMode === '100644') entries.push([path, '644']);
    else if (indexMode === '100755') entries.push([path, '755']);
  }
  return entries;
}

let modes = [];
let restoreDone = false;

function restoreModes() {
  if (restoreDone || !modes.length) return;
  restoreDone = true;
  for (const [path, mode] of modes) {
    try { run('chmod', [mode, path], { capture: true }); } catch { /* best effort */ }
  }
}

function installCleanupHooks() {
  const stop = signal => {
    restoreModes();
    teardown();
    process.exit(signal === 'SIGINT' ? 130 : 143);
  };
  process.once('SIGTERM', () => stop('SIGTERM'));
  process.once('SIGINT', () => stop('SIGINT'));
}

function record(name, result) {
  mkdirSync(ARTIFACTS, { recursive: true });
  writeFileSync(`${ARTIFACTS}/${name}.log`, `${result.stdout || ''}\n${result.stderr || ''}`);
}

async function healthy() {
  const deadline = Date.now() + TIMEOUT;
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt += 1;
    try {
      const response = await fetch(HEALTH, { signal: AbortSignal.timeout(5000) });
      if (response.ok) {
        log(`${HEALTH} -> ${response.status} on attempt ${attempt}`);
        return true;
      }
      log(`${HEALTH} -> ${response.status} (attempt ${attempt})`);
    } catch (error) {
      log(`${HEALTH} unreachable (attempt ${attempt}): ${error.message}`);
    }
    await sleep(2000);
  }
  return false;
}

function teardown() {
  if (KEEP) { log(`GATE_KEEP=1 — stack ${PROJECT} left running`); return; }
  compose(['down', '-v', '--remove-orphans'], { capture: true });
}

async function main() {
  if (!statSync(COMPOSE, { throwIfNoEntry: false })) fail(`missing compose file: ${COMPOSE}`);
  if (run(DOCKER, ['compose', 'version'], { capture: true }).status !== 0) fail('docker compose is not available');

  for (const pair of (process.env.GATE_ENV || '').split(/\s+/).filter(Boolean)) {
    const index = pair.indexOf('=');
    if (index < 1) fail(`GATE_ENV entry is not KEY=VALUE: ${pair}`);
    process.env[pair.slice(0, index)] = pair.slice(index + 1);
  }

  modes = STRICT ? trackedModes() : [];
  installCleanupHooks();
  try {
    if (STRICT && modes.length) {
      for (const [path] of modes) run('chmod', ['600', path], { capture: true });
      log(`strict modes: ${modes.length} tracked files set to 0600 before the build`);
    }
    const build = compose(['build'], { capture: true });
    record('build', build);
    if (build.status !== 0) {
      console.error(build.stdout || ''); console.error(build.stderr || '');
      fail('image build failed (see ci-container-logs/build.log)');
    }
    const up = compose(['up', '-d', '--wait'], { capture: true });
    record('up', up);
    if (up.status !== 0) {
      console.error(up.stderr || '');
      record('ps', compose(['ps'], { capture: true }));
      record('logs', compose(['logs', '--no-color'], { capture: true }));
      fail('compose up did not reach a healthy state (see ci-container-logs/logs.log)');
    }
    if (!(await healthy())) {
      record('ps', compose(['ps'], { capture: true }));
      record('logs', compose(['logs', '--no-color'], { capture: true }));
      fail(`health check never passed within ${TIMEOUT}ms`);
    }
    record('ps', compose(['ps'], { capture: true }));
    log('gate passed');
  } finally {
    try { teardown(); } catch (error) { log(`teardown failed: ${error.message}`); }
    restoreModes();
  }
}

main().catch(error => { console.error(error); teardown(); process.exit(2); });
