import { createHash, randomBytes } from "node:crypto";

import type { TokenGenerator } from "../ports/auth-ports";

const TOKEN_BYTES = 32;

/**
 * Opaque random tokens with a SHA-256 digest.
 *
 * The client and the mailed link carry the plaintext value; only the digest is
 * stored. A database read therefore cannot be replayed as a session or used to
 * reset a password. 32 random bytes (256 bits) is well beyond guessing range, and
 * the token is a bearer value, so the digest does not need a slow KDF.
 */
export class CryptoTokenGenerator implements TokenGenerator {
  generate(): { plain: string; hash: string } {
    const plain = randomBytes(TOKEN_BYTES).toString("base64url");
    return { plain, hash: this.hashOf(plain) };
  }

  hashOf(plain: string): string {
    return createHash("sha256").update(plain, "utf8").digest("hex");
  }
}
