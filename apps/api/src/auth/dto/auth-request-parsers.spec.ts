import { describe, expect, it } from "vitest";

import { ApiError } from "../../common/api-error";
import {
  parseEmailVerificationConfirmBody,
  parseLoginBody,
  parsePasswordResetConfirmBody,
  parsePasswordResetRequestBody,
  parseSignupBody,
} from "./auth-request-parsers";

const VALID_REGION = { sido: "경기", sigungu: "성남시 분당구", label: "성남시 분당구" };

function signupBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    email: "buyer@example.com",
    password: "password123",
    nickname: "판매왕",
    region: VALID_REGION,
    agreements: { termsOfService: true, privacyPolicy: true },
    ...overrides,
  };
}

function issuesOf(run: () => unknown): ApiError {
  try {
    run();
  } catch (error) {
    if (error instanceof ApiError) {
      return error;
    }
    throw error;
  }
  throw new Error("expected a validation error");
}

describe("signup body parsing", () => {
  it("accepts the S10 form payload and defaults marketing consent to false", () => {
    const command = parseSignupBody(signupBody());

    expect(command.email.value).toBe("buyer@example.com");
    expect(command.nickname).toBe("판매왕");
    expect(command.marketingOptIn).toBe(false);
    expect(command.region.sido).toBe("경기");
  });

  it("reports every invalid field at once, in the contract's details.fields shape", () => {
    const error = issuesOf(() => parseSignupBody({ email: "bad", password: "abc", title: "x" }));
    const fields = error.details?.fields as { path: string; code: string }[];

    expect(error.code).toBe("VALIDATION_FAILED");
    expect(fields.map((field) => field.path)).toEqual([
      "title",
      "email",
      "password",
      "nickname",
      "region",
      "agreements",
    ]);
  });

  it("requires both mandatory agreements and refuses a non-boolean marketing flag", () => {
    const missing = issuesOf(() => parseSignupBody(signupBody({ agreements: { marketing: "yes" } })));
    expect((missing.details?.fields as { path: string }[]).map((field) => field.path)).toEqual([
      "agreements.termsOfService",
      "agreements.privacyPolicy",
      "agreements.marketing",
    ]);
  });

  it("refuses a body that is not a JSON object", () => {
    expect(issuesOf(() => parseSignupBody([])).code).toBe("VALIDATION_FAILED");
  });
});

describe("login body parsing", () => {
  it("accepts a password that the signup policy would reject (login only compares)", () => {
    const command = parseLoginBody({ email: "buyer@example.com", password: "        " });

    expect(command.password).toBe("        ");
  });

  it("still requires both fields and caps the password length", () => {
    const error = issuesOf(() => parseLoginBody({ email: "buyer@example.com", password: "a".repeat(129) }));
    expect((error.details?.fields as { path: string; code: string }[])[0]).toEqual({
      path: "password",
      code: "max_length",
      message: "비밀번호는 128자 이내로 입력해 주세요.",
    });
  });
});

describe("password reset and email verification parsing", () => {
  it("accepts a bare address for the reset request", () => {
    expect(parsePasswordResetRequestBody({ email: "BUYER@example.com " }).email.value).toBe("buyer@example.com");
  });

  it("rejects a token shorter than the schema minimum", () => {
    const error = issuesOf(() => parseEmailVerificationConfirmBody({ token: "short" }));
    expect((error.details?.fields as { code: string }[])[0]?.code).toBe("min_length");
  });

  it("validates the new password against the signup policy", () => {
    const error = issuesOf(() => parsePasswordResetConfirmBody({ token: "x".repeat(20), newPassword: "short" }));
    expect((error.details?.fields as { path: string; code: string }[])[0]).toEqual({
      path: "newPassword",
      code: "min_length",
      message: "비밀번호는 8자 이상이어야 합니다.",
    });
  });

  it("trims a token that arrived with whitespace", () => {
    expect(parseEmailVerificationConfirmBody({ token: "  abcdefghijklmnop  " }).token).toBe("abcdefghijklmnop");
  });
});
