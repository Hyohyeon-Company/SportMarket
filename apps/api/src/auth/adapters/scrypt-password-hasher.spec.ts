import { describe, expect, it } from "vitest";

import { PasswordHash } from "../domain/password";
import { ScryptPasswordHasher } from "./scrypt-password-hasher";

describe("ScryptPasswordHasher", () => {
  const hasher = new ScryptPasswordHasher();

  it("stores a digest that neither equals nor contains the plaintext", async () => {
    const hash = await hasher.hash("password123");

    expect(hash.value).not.toContain("password123");
    expect(hash.value.startsWith("scrypt$16384$8$1$")).toBe(true);
    expect(hash.value.split("$")).toHaveLength(6);
  });

  it("verifies the right password and rejects a wrong one", async () => {
    const hash = await hasher.hash("password123");

    await expect(hasher.verify("password123", hash)).resolves.toBe(true);
    await expect(hasher.verify("password124", hash)).resolves.toBe(false);
  });

  it("salts every hash, so two identical passwords produce different digests", async () => {
    const first = await hasher.hash("password123");
    const second = await hasher.hash("password123");

    expect(first.value).not.toBe(second.value);
    await expect(hasher.verify("password123", first)).resolves.toBe(true);
    await expect(hasher.verify("password123", second)).resolves.toBe(true);
  });

  it("treats a malformed stored value as a failed verification instead of throwing", async () => {
    await expect(hasher.verify("password123", PasswordHash.fromStorage("plaintext"))).resolves.toBe(false);
    await expect(hasher.verify("password123", PasswordHash.fromStorage("scrypt$x$8$1$aaaa$bbbb"))).resolves.toBe(false);
  });
});
