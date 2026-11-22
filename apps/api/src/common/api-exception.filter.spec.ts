import { BadRequestException, NotFoundException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { ApiError } from "./api-error";
import { envelopeFor } from "./api-exception.filter";

describe("envelopeFor", () => {
  it("maps a domain error to its contract status, message and details", () => {
    const mapped = envelopeFor(new ApiError("ACCOUNT_SUSPENDED", "이용이 정지된 계정입니다. 조회만 가능합니다."));

    expect(mapped.status).toBe(403);
    expect(mapped.body).toEqual({ code: "ACCOUNT_SUSPENDED", message: "이용이 정지된 계정입니다. 조회만 가능합니다." });
  });

  it("keeps details for a validation failure (details.fields[])", () => {
    const fields = [{ path: "password", code: "min_length", message: "비밀번호는 8자 이상이어야 합니다." }];
    const mapped = envelopeFor(new ApiError("VALIDATION_FAILED", "입력값을 확인해 주세요.", { fields }));

    expect(mapped.status).toBe(400);
    expect(mapped.body.details).toEqual({ fields });
  });

  it("exposes Retry-After for a rate limit and never below one second", () => {
    const mapped = envelopeFor(new ApiError("RATE_LIMITED", "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", { retryAfterSeconds: 0.2 }));

    expect(mapped.status).toBe(429);
    expect(mapped.retryAfterSeconds).toBe(1);
  });

  it("converts a framework 404 into the contract envelope instead of a framework message", () => {
    const mapped = envelopeFor(new NotFoundException("Cannot GET /nope"));

    expect(mapped.status).toBe(404);
    expect(mapped.body).toEqual({ code: "NOT_FOUND", message: "요청한 정보를 찾을 수 없습니다." });
  });

  it("turns a malformed body into VALIDATION_FAILED", () => {
    const mapped = envelopeFor(new BadRequestException("Unexpected token"));

    expect(mapped.status).toBe(400);
    expect(mapped.body.code).toBe("VALIDATION_FAILED");
    expect(mapped.body.message).not.toContain("Unexpected token");
  });

  it("hides an unexpected failure behind the generic 500", () => {
    const mapped = envelopeFor(new Error("connect ECONNREFUSED 127.0.0.1:3306"));

    expect(mapped.status).toBe(500);
    expect(mapped.body).toEqual({
      code: "INTERNAL_ERROR",
      message: "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
    });
  });

  it("maps every 401-producing code to 401 and every ownership/gate code to 403/409", () => {
    expect(envelopeFor(new ApiError("UNAUTHENTICATED", "x")).status).toBe(401);
    expect(envelopeFor(new ApiError("INVALID_CREDENTIALS", "x")).status).toBe(401);
    expect(envelopeFor(new ApiError("CSRF_TOKEN_INVALID", "x")).status).toBe(403);
    expect(envelopeFor(new ApiError("CSRF_TOKEN_MISSING", "x")).status).toBe(403);
    expect(envelopeFor(new ApiError("EMAIL_ALREADY_REGISTERED", "x")).status).toBe(409);
    expect(envelopeFor(new ApiError("PASSWORD_RESET_TOKEN_INVALID", "x")).status).toBe(400);
    expect(envelopeFor(new ApiError("EMAIL_VERIFICATION_TOKEN_INVALID", "x")).status).toBe(400);
  });
});
