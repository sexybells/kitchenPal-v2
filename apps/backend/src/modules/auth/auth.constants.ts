/**
 * Token lifetimes. Access tokens are short so a leaked one expires quickly;
 * refresh tokens are long-lived but single-use and rotated, so the practical
 * exposure window is bounded by rotation, not by this TTL.
 */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes
export const REFRESH_TOKEN_TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days

/**
 * Default access-token lifetime for accounts holding the `admin` role. Admin
 * sessions are privileged, so they get a shorter default TTL than regular users
 * to bound the exposure window of a leaked admin token. Operators can override
 * it via `ADMIN_ACCESS_TOKEN_TTL_SECONDS`.
 */
export const ADMIN_ACCESS_TOKEN_TTL_SECONDS = 10 * 60; // 10 minutes

/** Access tokens are signed and verified with exactly this algorithm (pinned). */
export const ACCESS_TOKEN_ALGORITHM = "HS256" as const;

/** Single-use grant lifetimes. */
export const PASSWORD_RESET_TTL_SECONDS = 60 * 60; // 1 hour
export const EMAIL_VERIFICATION_TTL_SECONDS = 24 * 60 * 60; // 24 hours
export const OTP_TTL_SECONDS = 5 * 60; // 5 minutes

/** Maximum verification attempts before an OTP code is rejected outright. */
export const OTP_MAX_ATTEMPTS = 5;

/**
 * Development-only access-token secret used when JWT_ACCESS_SECRET is unset
 * outside production. Production validation rejects a missing secret, so this
 * value can never sign tokens in a real deployment.
 */
export const DEV_ACCESS_SECRET = "dev-insecure-access-secret-do-not-use-in-prod";
