import { Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import type { Request, Response } from "express";

import { ApiError } from "../../common/api-error";
import { API_MESSAGES } from "../../common/api-messages";
import { AuthService, type AuthenticatedCaller } from "../application/auth.service";
import { AUTH_POLICY } from "../domain/auth-policy";
import { clearSessionCookieHeaders, cookiesSecureFromEnv, readCookie, headerValue } from "./session-cookies";

/** Request after `SessionGuard` has resolved the cookie into an account. */
export interface AuthenticatedRequest extends Request {
  auth?: AuthenticatedCaller;
}

/**
 * Session authentication as a guard, not a service call in each handler: a new
 * endpoint cannot forget it, and "no session" is the contract's 401 in one place.
 *
 * D-2: a cookie that no longer authenticates (expired or revoked) yields
 * `401 UNAUTHENTICATED` and is expired in the same response, so the browser stops
 * sending a dead value. A request with no cookie at all gets no `Set-Cookie`,
 * because there is nothing to clean up.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<AuthenticatedRequest>();
    const token = readCookie(headerValue(request.headers.cookie), AUTH_POLICY.cookies.session);
    try {
      request.auth = await this.auth.resolveCaller(token);
    } catch (error) {
      if (token !== null) {
        http.getResponse<Response>().setHeader("Set-Cookie", clearSessionCookieHeaders(cookiesSecureFromEnv()));
      }
      throw error;
    }
    return true;
  }
}

/**
 * CSRF check for state-changing requests.
 *
 * D-1 double submit: the request must carry the readable `sm_csrf` cookie *and*
 * echo it in `X-CSRF-Token`, and the value must match the digest bound to this
 * session. Three separate refusals, because they mean different things to a
 * client: a missing token is a wiring/cookie problem, a mismatch is an attack or a
 * stale tab.
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
    const headers = request.headers;
    const presented = headerValue(headers[AUTH_POLICY.csrfHeaderName.toLowerCase()]);
    const cookie = readCookie(headerValue(headers.cookie), AUTH_POLICY.cookies.csrf);
    this.auth.assertCsrfToken(caller, presented, cookie);
    return true;
  }
}
