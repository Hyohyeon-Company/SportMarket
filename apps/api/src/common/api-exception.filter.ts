import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from "@nestjs/common";
import type { Response } from "express";

import { isApiError, type ApiErrorCode } from "./api-error";
import { codeForStatus, fallbackMessageFor, statusForCode } from "./http-error-map";

export interface ErrorEnvelope {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface MappedError {
  status: number;
  body: ErrorEnvelope;
  /** Present for 429 so the response can carry `Retry-After` (contract header). */
  retryAfterSeconds?: number;
}

/**
 * Pure mapping from a thrown value to status + contract envelope.
 *
 * Separated from the Nest filter so the mapping (including "never leak an internal
 * message") is unit-testable without booting an application.
 */
export function envelopeFor(exception: unknown): MappedError {
  if (isApiError(exception)) {
    const mapped: MappedError = {
      status: statusForCode(exception.code),
      body: withDetails(exception.code, exception.message, exception.details),
    };
    const retryAfter = exception.details?.retryAfterSeconds;
    if (exception.code === "RATE_LIMITED" && typeof retryAfter === "number" && Number.isFinite(retryAfter)) {
      mapped.retryAfterSeconds = Math.max(1, Math.ceil(retryAfter));
    }
    return mapped;
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const code = codeForStatus(status);
    return { status, body: { code, message: fallbackMessageFor(code) } };
  }

  const code: ApiErrorCode = "INTERNAL_ERROR";
  return { status: statusForCode(code), body: { code, message: fallbackMessageFor(code) } };
}

/**
 * Last-resort filter: whatever escapes a handler leaves as the contract's single
 * error shape, and an unexpected failure never exposes a stack trace, SQL text or
 * a framework message to the client.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const mapped = envelopeFor(exception);

    if (mapped.status >= 500) {
      this.logger.error(exception instanceof Error ? `${exception.name}: ${exception.message}` : "unknown error");
    }
    if (mapped.retryAfterSeconds !== undefined) {
      response.setHeader("Retry-After", String(mapped.retryAfterSeconds));
    }
    response.status(mapped.status).json(mapped.body);
  }
}

function withDetails(code: ApiErrorCode, message: string, details: Record<string, unknown> | undefined): ErrorEnvelope {
  const body: ErrorEnvelope = { code, message };
  if (details !== undefined) {
    body.details = details;
  }
  return body;
}
