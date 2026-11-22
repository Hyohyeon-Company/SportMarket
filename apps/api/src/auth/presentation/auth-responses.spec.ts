import { describe, expect, it } from "vitest";

import { Email } from "../domain/email";
import { PasswordHash } from "../domain/password";
import { Session } from "../domain/session";
import { UserAccount } from "../domain/user-account";
import { toAcceptedBody, toSessionBody } from "./auth-responses";

const CREATED_AT = new Date("2026-11-20T00:00:00.000Z");

function user(): UserAccount {
  return UserAccount.register({
    id: "u_1",
    email: Email.parse("buyer@example.com"),
    passwordHash: PasswordHash.fromStorage("scrypt$16384$8$1$salt$digest"),
    nickname: "판매왕",
    region: { sido: "경기", sigungu: "성남시 분당구", label: "성남시 분당구" },
    createdAt: CREATED_AT,
  });
}

describe("toSessionBody", () => {
  it("describes an anonymous visitor with nulls, as the boot contract requires", () => {
    expect(toSessionBody({ session: null, user: null })).toEqual({
      authenticated: false,
      user: null,
      profile: null,
    });
  });

  it("returns the owner's email, status and ISO timestamps and no credential field", () => {
    const account = user();
    const session = Session.start({
      id: "s_1",
      userId: account.id,
      tokenHash: "a",
      csrfTokenHash: "b",
      issuedAt: CREATED_AT,
      expiresAt: new Date(CREATED_AT.getTime() + 1000),
    });
    const body = toSessionBody({ session, user: account });

    expect(body.authenticated).toBe(true);
    expect(body.user).toEqual({
      id: "u_1",
      email: "buyer@example.com",
      status: "active",
      emailVerified: false,
      createdAt: CREATED_AT.toISOString(),
    });
    expect(body.profile?.nickname).toBe("판매왕");
    expect(body.profile?.region?.label).toBe("성남시 분당구");
    expect(JSON.stringify(body)).not.toContain("scrypt$");
  });
});

describe("toAcceptedBody", () => {
  it("is the schema's single accepted field", () => {
    expect(toAcceptedBody()).toEqual({ accepted: true });
  });
});
