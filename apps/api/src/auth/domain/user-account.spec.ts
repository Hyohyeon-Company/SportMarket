import { describe, expect, it } from "vitest";

import { ApiError } from "../../common/api-error";
import { Email } from "./email";
import { PasswordHash } from "./password";
import { UserAccount } from "./user-account";

const CREATED_AT = new Date("2026-11-20T00:00:00.000Z");

function register(): UserAccount {
  return UserAccount.register({
    id: "u_1",
    email: Email.parse("Buyer@Example.com"),
    passwordHash: PasswordHash.fromStorage("fake$secret123"),
    nickname: "  판매왕  ",
    region: { sido: "경기", sigungu: "성남시 분당구", label: "성남시 분당구" },
    createdAt: CREATED_AT,
  });
}

describe("UserAccount", () => {
  it("registers an active, unverified account with a trimmed nickname and no bio", () => {
    const user = register();

    expect(user.status).toBe("active");
    expect(user.isEmailVerified()).toBe(false);
    expect(user.profile.nickname).toBe("판매왕");
    expect(user.profile.bio).toBe("");
    expect(user.profile.joinedAt).toEqual(CREATED_AT);
    expect(user.suspendedReason).toBeNull();
    expect(user.email.value).toBe("buyer@example.com");
  });

  it("lets an active account start a session", () => {
    expect(() => {
      register().assertCanStartSession();
    }).not.toThrow();
  });

  it("refuses a session for a suspended account and carries the reason (AC on stop)", () => {
    const user = register();
    user.suspend("반복된 허위 매물 신고 접수");

    expect(() => {
      user.assertCanStartSession();
    }).toThrow(ApiError);

    try {
      user.assertCanStartSession();
    } catch (error) {
      const apiError = error as ApiError;
      expect(apiError.code).toBe("ACCOUNT_SUSPENDED");
      expect(apiError.details).toEqual({ suspendedReason: "반복된 허위 매물 신고 접수" });
    }
  });

  it("answers a deleted account with the non-enumerating 401 instead of confirming it existed", () => {
    const user = register();
    user.markDeleted();

    try {
      user.assertCanStartSession();
      throw new Error("expected an ApiError");
    } catch (error) {
      expect((error as ApiError).code).toBe("INVALID_CREDENTIALS");
    }
  });

  it("treats a suspended account as read-only for session-bound changes", () => {
    const user = register();
    user.suspend(null);

    try {
      user.assertCanChangeState();
      throw new Error("expected an ApiError");
    } catch (error) {
      expect((error as ApiError).code).toBe("ACCOUNT_SUSPENDED");
      expect((error as ApiError).message).toBe("이용이 정지된 계정입니다. 조회만 가능합니다.");
      expect((error as ApiError).details).toBeUndefined();
    }
  });

  it("keeps the first verification timestamp when confirmed twice", () => {
    const user = register();
    user.markEmailVerified(new Date("2026-11-20T01:00:00.000Z"));
    user.markEmailVerified(new Date("2026-11-21T01:00:00.000Z"));

    expect(user.isEmailVerified()).toBe(true);
  });

  it("replaces the stored credential without changing identity", () => {
    const user = register();
    user.changePassword(PasswordHash.fromStorage("fake$newpassword"));

    expect(user.passwordHash.value).toBe("fake$newpassword");
    expect(user.id).toBe("u_1");
    expect(user.status).toBe("active");
  });

  it("does not leak stored state through a returned snapshot", () => {
    const user = register();
    const state = user.toState();
    state.profile.nickname = "변경됨";

    expect(user.profile.nickname).toBe("판매왕");
  });
});
