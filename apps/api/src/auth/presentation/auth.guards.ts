import { Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

import { ApiError } from "../../common/api-error";
import { API_MESSAGES } from "../../common/api-messages";
import { AuthService, type AuthenticatedCaller } from "../application/auth.service";
import { AUTH_POLICY } from "../domain/auth-policy";
import { readCookie, headerValue } from "./session-cookies";

/** Request after `SessionGuard` has resolved the cookie into an account. */
export interface AuthenticatedRequest extends Request {
  auth?: AuthenticatedCaller;
}

/**
 * Session authentication as a guard, not a service call in each handler: a new
 * endpoint cannot forget it, and "no session" is the contract's 401 in one place.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = readCookie(headerValue(request.headers.cookie), AUTH_POLICY.cookies.session);
    request.auth = await this.auth.resolveCaller(token);
    return true;
  }
}

/**
 * CSRF check for state-changing requests.
 *
 * It runs after `SessionGuard`, so the comparison is always against the session
 * the cookie just proved — a token issued to another session never matches.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const caller = request.auth;
    if (caller === undefined) {
      throw new ApiError("UNAUTHENTICATED", API_MESSAGES.unauthenticated);
    }
    const raw = headerValue(request.headers[AUTH_POLICY.csrfHeaderName.toLowerCase()]);
    this.auth.assertCsrfToken(caller, raw);
    return true;
  }
}
