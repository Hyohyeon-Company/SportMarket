import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";

import {
  parseEmailVerificationConfirmBody,
  parseLoginBody,
  parsePasswordResetConfirmBody,
  parsePasswordResetRequestBody,
  parseSignupBody,
} from "../dto/auth-request-parsers";
import { AuthService, type AuthenticatedCaller } from "../application/auth.service";
import { AUTH_POLICY } from "../domain/auth-policy";
import { CurrentCaller } from "./current-caller.decorator";
import { CsrfGuard, SessionGuard, type AuthenticatedRequest } from "./auth.guards";
import { toAcceptedBody, toSessionBody, type AcceptedBody, type SessionBody } from "./auth-responses";
import {
  clearedCookieSpecs,
  cookiesSecureFromEnv,
  headerValue,
  readCookie,
  serialiseCookieHeaders,
  sessionCookieSpecs,
} from "./session-cookies";

/**
 * F-01 HTTP surface: the eight `/auth` operations of the pinned contract.
 *
 * The controller stays thin on purpose — parse, delegate, map, set cookies — so
 * every rule it could get wrong lives in the aggregate or the service, and the
 * contract's status codes are visible next to the route they belong to.
 */
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** AC-01-1: 201 with a session cookie; the body carries no token. */
  @Post("signup")
  @HttpCode(HttpStatus.CREATED)
  async signup(@Body() body: unknown, @Res({ passthrough: true }) response: Response): Promise<SessionBody> {
    const command = parseSignupBody(body);
    const result = await this.auth.signup(command);
    this.setSessionCookies(response, result.issued);
    return toSessionBody(result.snapshot);
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: unknown, @Res({ passthrough: true }) response: Response): Promise<SessionBody> {
    const command = parseLoginBody(body);
    const result = await this.auth.login(command);
    this.setSessionCookies(response, result.issued);
    return toSessionBody(result.snapshot);
  }

  /**
   * AC-01-4: 204 and both cookies expire. A suspended account is allowed here even
   * though it is read-only, because otherwise the user cannot end the session.
   */
  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SessionGuard, CsrfGuard)
  async logout(@CurrentCaller() caller: AuthenticatedCaller, @Res({ passthrough: true }) response: Response): Promise<void> {
    await this.auth.logout(caller);
    this.clearSessionCookies(response);
  }

  /** Anonymous visitors also get 200 (`authenticated: false`), per the contract. */
  @Get("session")
  @HttpCode(HttpStatus.OK)
  async session(@Req() request: AuthenticatedRequest, @Res({ passthrough: true }) response: Response): Promise<SessionBody> {
    const token = readCookie(headerValue(request.headers.cookie), AUTH_POLICY.cookies.session);
    const snapshot = await this.auth.getSession(token);
    if (snapshot.session === null && token !== null) {
      // A stale cookie is cleaned up rather than left to fail on every request;
      // an anonymous visitor who sent no cookie gets no Set-Cookie at all.
      this.clearSessionCookies(response);
    }
    return toSessionBody(snapshot);
  }

  /** Always 202, so the endpoint cannot be used to discover registered emails. */
  @Post("password-reset")
  @HttpCode(HttpStatus.ACCEPTED)
  async requestPasswordReset(@Body() body: unknown): Promise<AcceptedBody> {
    await this.auth.requestPasswordReset(parsePasswordResetRequestBody(body));
    return toAcceptedBody();
  }

  /** 204; the token is single-use, valid 30 minutes, and ends every old session. */
  @Post("password-reset/confirm")
  @HttpCode(HttpStatus.NO_CONTENT)
  async confirmPasswordReset(@Body() body: unknown): Promise<void> {
    await this.auth.confirmPasswordReset(parsePasswordResetConfirmBody(body));
  }

  /** Resend while signed in (CSRF required); 202 either way. */
  @Post("email-verification")
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(SessionGuard, CsrfGuard)
  async resendEmailVerification(@CurrentCaller() caller: AuthenticatedCaller): Promise<AcceptedBody> {
    await this.auth.resendEmailVerification(caller.user);
    return toAcceptedBody();
  }

  /** Anonymous flow: the mailed token proves possession of the address. */
  @Post("email-verification/confirm")
  @HttpCode(HttpStatus.NO_CONTENT)
  async confirmEmailVerification(@Body() body: unknown): Promise<void> {
    await this.auth.confirmEmailVerification(parseEmailVerificationConfirmBody(body));
  }

  private setSessionCookies(
    response: Response,
    issued: { sessionToken: string; csrfToken: string; expiresAt: Date },
  ): void {
    const specs = sessionCookieSpecs(issued, { secure: cookiesSecureFromEnv(), now: new Date() });
    response.setHeader("Set-Cookie", serialiseCookieHeaders(specs));
  }

  private clearSessionCookies(response: Response): void {
    response.setHeader("Set-Cookie", serialiseCookieHeaders(clearedCookieSpecs({ secure: cookiesSecureFromEnv() })));
  }
}
