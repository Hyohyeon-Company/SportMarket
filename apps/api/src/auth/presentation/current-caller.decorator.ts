import { createParamDecorator, type ExecutionContext } from "@nestjs/common";

import { ApiError } from "../../common/api-error";
import { API_MESSAGES } from "../../common/api-messages";
import type { AuthenticatedCaller } from "../application/auth.service";
import type { AuthenticatedRequest } from "./auth.guards";

/**
 * Reads the caller that `SessionGuard` put on the request.
 *
 * Throwing instead of returning `undefined` keeps a controller honest: a handler
 * behind the guard can never receive a missing account and decide for itself what
 * an anonymous write should do.
 */
export const CurrentCaller = createParamDecorator((_data: unknown, context: ExecutionContext): AuthenticatedCaller => {
  const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
  if (request.auth === undefined) {
    throw new ApiError("UNAUTHENTICATED", API_MESSAGES.unauthenticated);
  }
  return request.auth;
});
