import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

import { ApiError } from "../../common/api-error";
import { PasswordHash } from "../domain/password";
import type { PasswordHasher } from "../ports/auth-ports";

const scryptAsync = promisify(scryptCallback) as unknown as (
  password: string,
  salt: Buffer,
  keyLength: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * scrypt password hashing with a per-password salt.
 *
 * Why the standard library: the scaffold's `apps/api` has no hashing dependency
 * yet and this card may not install one, and `node:crypto` scrypt is a memory-hard
 * KDF that is appropriate for password storage. The port means a later card can
 * switch to argon2id without touching a rule.
 *
 * Parameters are embedded in the stored value so a cost change does not require a
 * migration: `scrypt$<N>$<r>$<p>$<salt>$<digest>` (base64url, no padding).
 */
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SALT_BYTES = 16;
const DIGEST_BYTES = 64;
const STORED_PREFIX = "scrypt";

export class ScryptPasswordHasher implements PasswordHasher {
  async hash(plaintext: string): Promise<PasswordHash> {
    const salt = randomBytes(SALT_BYTES);
    const digest = await this.derive(plaintext, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P, DIGEST_BYTES);
    return PasswordHash.fromStorage(
      [STORED_PREFIX, SCRYPT_N, SCRYPT_R, SCRYPT_P, encode(salt), encode(digest)].join("$"),
    );
  }

  async verify(plaintext: string, hash: PasswordHash): Promise<boolean> {
    const parsed = parseStored(hash.value);
    if (parsed === null) {
      return false;
    }
    const digest = await this.derive(plaintext, parsed.salt, parsed.n, parsed.r, parsed.p, parsed.expected.length);
    return digest.length === parsed.expected.length && timingSafeEqual(digest, parsed.expected);
  }

  private async derive(
    plaintext: string,
    salt: Buffer,
    n: number,
    r: number,
    p: number,
    keyLength: number,
  ): Promise<Buffer> {
    // `maxmem` is raised because the default 32 MiB limit is exactly at the edge
    // for N=16384/r=8 and produces an intermittent failure on some Node builds.
    const derived = await scryptAsync(plaintext.normalize("NFC"), salt, keyLength, { N: n, r, p, maxmem: 96 * 1024 * 1024 });
    if (!Buffer.isBuffer(derived)) {
      throw new ApiError("INTERNAL_ERROR", "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    }
    return derived;
  }
}

interface ParsedStored {
  n: number;
  r: number;
  p: number;
  salt: Buffer;
  expected: Buffer;
}

function parseStored(value: string): ParsedStored | null {
  const parts = value.split("$");
  if (parts.length !== 6) {
    return null;
  }
  const [prefix, rawN, rawR, rawP, rawSalt, rawDigest] = parts;
  if (prefix !== STORED_PREFIX || rawN === undefined || rawR === undefined || rawP === undefined || rawSalt === undefined || rawDigest === undefined) {
    return null;
  }
  const n = Number.parseInt(rawN, 10);
  const r = Number.parseInt(rawR, 10);
  const p = Number.parseInt(rawP, 10);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) {
    return null;
  }
  return { n, r, p, salt: decode(rawSalt), expected: decode(rawDigest) };
}

function encode(buffer: Buffer): string {
  return buffer.toString("base64url");
}

function decode(value: string): Buffer {
  return Buffer.from(value, "base64url");
}
