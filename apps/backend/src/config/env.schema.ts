import { config as loadDotenv } from "dotenv";
import { z } from "zod";

/**
 * Authoritative environment contract. Validated once at startup; an invalid
 * environment fails fast rather than surfacing as obscure runtime errors.
 */
const LOCALHOST_PATTERN = /(localhost|127\.0\.0\.1|::1)/i;

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().positive().default(3001),
    MONGODB_URI: z
      .string()
      .min(1)
      .default("mongodb://127.0.0.1:27017/kitchenpal"),
    REDIS_URL: z.string().min(1).optional(),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    THROTTLE_TTL: z.coerce.number().int().positive().default(60000),
    THROTTLE_LIMIT: z.coerce.number().int().positive().default(100),
    SWAGGER_ENABLED: z
      .enum(["true", "false"])
      .default("true")
      .transform((value) => value === "true"),
    // Signing secret for short-lived access JWTs. Optional in dev/test (a
    // logged development fallback is used); required in production.
    JWT_ACCESS_SECRET: z.string().min(1).optional(),
    // Reserved for future signed-refresh strategies. Refresh tokens are opaque
    // and stored hashed, so this is not required for rotation to work.
    JWT_REFRESH_SECRET: z.string().min(1).optional(),
    // Comma-separated allowlist of emails that may be elevated to `admin`.
    ADMIN_EMAILS: z.string().optional(),
    // Shared secret required to perform the admin bootstrap elevation.
    ADMIN_BOOTSTRAP_SECRET: z.string().min(1).optional(),
    // Comma-separated accepted audiences for Google/Apple identity tokens. When
    // unset, social sign-in uses a development-only path (rejected in production).
    GOOGLE_CLIENT_IDS: z.string().optional(),
    APPLE_CLIENT_IDS: z.string().optional(),
    // Resend transactional email. When unset, tokens are logged instead of sent
    // (development only; rejected in production).
    RESEND_API_KEY: z.string().min(1).optional(),
    EMAIL_FROM: z.string().default("KitchenPal <noreply@kitchenpal.local>"),
    // Base URL used to build links inside verification/reset emails.
    APP_WEB_URL: z.string().default("http://localhost:3000"),
    // Local filesystem storage for uploaded avatars (S3 adapter in production).
    UPLOAD_DIR: z.string().default("./uploads"),
    // Public base URL under which stored uploads are served.
    UPLOAD_PUBLIC_BASE_URL: z.string().default("/uploads"),
  })
  // Production guardrails: the in-memory / localhost fallbacks used for local
  // development are unsafe in production (per-instance rate limiting that is
  // N× the intended global limit and resets on restart, incoherent cache, and
  // booting against the wrong database). Require real infrastructure there.
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== "production") {
      return;
    }
    if (!env.REDIS_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["REDIS_URL"],
        message:
          "REDIS_URL is required in production (shared rate limiting, cache, and queues).",
      });
    }
    if (LOCALHOST_PATTERN.test(env.MONGODB_URI)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["MONGODB_URI"],
        message:
          "A non-localhost MONGODB_URI must be set explicitly in production.",
      });
    }
    // Access tokens must be signed with a real secret in production; the dev
    // fallback secret is never acceptable for a production deployment.
    if (!env.JWT_ACCESS_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["JWT_ACCESS_SECRET"],
        message: "JWT_ACCESS_SECRET is required in production.",
      });
    }
  });

export type AppConfig = z.infer<typeof envSchema>;

/** Injection token for the validated, frozen application config. */
export const APP_CONFIG = "APP_CONFIG";

/**
 * Loads `.env` (without overriding already-set process env) and validates it.
 * Throws with a readable message listing every offending variable.
 */
export function loadConfig(): AppConfig {
  loadDotenv();
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return Object.freeze(parsed.data);
}
