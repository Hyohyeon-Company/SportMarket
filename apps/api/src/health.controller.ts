import { Controller, Get } from "@nestjs/common";

/**
 * Liveness payload.
 *
 * This is an operational probe, not an API-contract resource, so it stays out
 * of `packages/shared`. It must not check the database: a health endpoint that
 * fails when MySQL is unavailable cannot distinguish "process alive" from
 * "dependency degraded".
 */
export interface HealthResponse {
  status: "ok";
  service: "sportmarket-api";
}

@Controller("health")
export class HealthController {
  @Get()
  read(): HealthResponse {
    return { status: "ok", service: "sportmarket-api" };
  }
}
