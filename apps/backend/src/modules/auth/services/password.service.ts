import { Injectable } from "@nestjs/common";
import { compare, hash, hashSync } from "bcryptjs";

/** bcrypt work factor. 12 balances resistance to offline cracking with login latency. */
const BCRYPT_COST = 12;

/**
 * A precomputed VALID bcrypt hash at the same cost. Login verifies against this
 * when an account is missing or has no password, so the (expensive) KDF always
 * runs and the missing-user path takes the same time as a wrong-password path.
 * A malformed placeholder would short-circuit `compare` and leak, via timing,
 * whether an email is registered.
 */
const TIMING_EQUALIZER_HASH = hashSync("timing-equalizer", BCRYPT_COST);

/**
 * Password hashing and verification. bcrypt embeds its salt in the hash, so no
 * separate salt storage is needed. Verification is constant-time via bcrypt's
 * own comparison.
 */
@Injectable()
export class PasswordService {
  /** Valid hash to compare against on the no-account / no-password path. */
  readonly timingEqualizerHash = TIMING_EQUALIZER_HASH;

  hash(plain: string): Promise<string> {
    return hash(plain, BCRYPT_COST);
  }

  verify(plain: string, passwordHash: string): Promise<boolean> {
    return compare(plain, passwordHash);
  }
}
