import { createHash, randomBytes, randomInt } from "node:crypto";

/**
 * Helpers for high-entropy, single-use secrets (refresh tokens, reset/verify
 * grants) and short numeric OTP codes.
 *
 * Long secrets are generated with 256 bits of randomness and only ever stored
 * as their SHA-256 digest. Because the secret itself is high-entropy, a fast
 * one-way digest (not bcrypt) is the right lookup key: the database never holds
 * a replayable value, yet lookups stay O(1).
 */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

/** SHA-256 hex digest used as the stored/lookup form of an opaque secret. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** A uniformly-random 6-digit numeric OTP code (zero-padded). */
export function generateOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}
