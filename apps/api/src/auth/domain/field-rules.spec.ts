import { describe, expect, it } from "vitest";

import { emailFieldIssues } from "./email";
import { passwordFieldIssues } from "./password";
import { nicknameFieldIssues, regionFieldIssues } from "./profile";

describe("field validation", () => {
  it("accepts an ordinary address and normalises it through the value object", () => {
    expect(emailFieldIssues("buyer@example.com")).toEqual([]);
    expect(emailFieldIssues(" buyer@example.com ")).toEqual([]);
  });

  it("rejects a missing, malformed or over-long address", () => {
    expect(emailFieldIssues(undefined)[0]?.code).toBe("required");
    expect(emailFieldIssues("not-an-email")[0]?.code).toBe("format");
    expect(emailFieldIssues(`${"a".repeat(250)}@example.com`)[0]?.code).toBe("max_length");
  });

  it("enforces the 8..128 password policy with a non-blank rule (AC-01-3)", () => {
    expect(passwordFieldIssues("short")).toEqual([{ path: "password", code: "min_length", message: "비밀번호는 8자 이상이어야 합니다." }]);
    expect(passwordFieldIssues("a".repeat(129))[0]?.code).toBe("max_length");
    expect(passwordFieldIssues("         ")[0]?.code).toBe("pattern");
    expect(passwordFieldIssues("password123")).toEqual([]);
  });

  it("does not apply the password policy to the login field (it only compares)", () => {
    // Login uses its own parser; the domain policy is the signup/reset one, so a
    // whitespace-only value is refused here on purpose.
    expect(passwordFieldIssues("x")[0]?.code).toBe("min_length");
  });

  it("requires a nickname of 2..20 characters that is not blanks", () => {
    expect(nicknameFieldIssues("가")[0]?.code).toBe("min_length");
    expect(nicknameFieldIssues("  ")[0]?.code).toBe("pattern");
    expect(nicknameFieldIssues("가".repeat(21))[0]?.code).toBe("max_length");
    expect(nicknameFieldIssues("판매왕")).toEqual([]);
  });

  it("requires all three region fields and no extra ones (AC-02-3: no coordinates)", () => {
    expect(regionFieldIssues({ sido: "경기", sigungu: "성남시 분당구", label: "성남시 분당구" })).toEqual([]);
    expect(regionFieldIssues({ sido: "경기" }).map((issue) => issue.path)).toEqual(["region.sigungu", "region.label"]);
    expect(regionFieldIssues({ sido: "경기", sigungu: "성남시", label: "성남시", latitude: 37.4 })[0]?.code).toBe("unknown_field");
  });
});
