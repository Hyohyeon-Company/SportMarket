import { describe, expect, it } from "vitest";

import { ApiError } from "../../common/api-error";
import { OneTimeToken } from "./one-time-token";

const ISSUED_AT = new Date("2026-11-20T00:00:00.000Z");
const EXPIRES_AT = new Date("2026-11-20T00:30:00.000Z");

function issue(purpose: "password_reset" | "email_verification" = "password_reset"): OneTimeToken {
  return OneTimeToken.issue({
    id: "t_1",
    userId: "u_1",
    purpose,
    tokenHash: "a".repeat(64),
    issuedAt: ISSUED_AT,
    expiresAt: EXPIRES_AT,
  });
}

describe("OneTimeToken", () => {
  it("is usable inside its window for its own purpose (AC-01-6: 30 minutes)", () => {
    const token = issue();

    expect(token.isUsable(new Date("2026-11-20T00:29:59.000Z"), "password_reset")).toBe(true);
    expect(token.isUsable(EXPIRES_AT, "password_reset")).toBe(false);
  });

  it("refuses a token issued for another purpose", () => {
    const token = issue("email_verification");

    expect(token.isUsable(ISSUED_AT, "password_reset")).toBe(false);
    expect(() => {
      token.consume(ISSUED_AT, "password_reset");
    }).toThrow(ApiError);
    expect(errorCodeOf(() => token.consume(ISSUED_AT, "password_reset"))).toBe("PASSWORD_RESET_TOKEN_INVALID");
  });

  it("cannot be consumed twice and reports the reset message on reuse", () => {
    const token = issue();
    token.consume(ISSUED_AT, "password_reset");

    expect(token.isUsable(new Date("2026-11-20T00:10:00.000Z"), "password_reset")).toBe(false);
    expect(errorCodeOf(() => token.consume(new Date("2026-11-20T00:10:00.000Z"), "password_reset"))).toBe(
      "PASSWORD_RESET_TOKEN_INVALID",
    );
  });

  it("uses the verification message when an email token is expired", () => {
    const token = issue("email_verification");

    expect(errorCodeOf(() => token.consume(new Date("2026-11-20T00:31:00.000Z"), "email_verification"))).toBe(
      "EMAIL_VERIFICATION_TOKEN_INVALID",
    );
  });

  it("records the consumption time only when it succeeds", () => {
    const token = issue();

    expect(token.consumedAt).toBeNull();
    token.consume(ISSUED_AT, "password_reset");
    expect(token.consumedAt).toEqual(ISSUED_AT);
  });
});

function errorCodeOf(run: () => void): string {
  try {
    run();
    return "none";
  } catch (error) {
    return error instanceof ApiError ? error.code : "unknown";
  }
}
