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
    // Shorter access-token TTL (seconds) for accounts with the `admin` role, to
    // bound the exposure of a leaked admin session. Defaults to 10 minutes.
    ADMIN_ACCESS_TOKEN_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .max(24 * 60 * 60)
      .default(10 * 60),
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
    // Storage transport: `local` writes to disk (dev only); `s3` writes to an
    // S3-compatible bucket (required in production — enforced below).
    STORAGE_PROVIDER: z.enum(["local", "s3"]).default("local"),
    // Local filesystem storage for uploaded avatars (STORAGE_PROVIDER=local).
    UPLOAD_DIR: z.string().default("./uploads"),
    // Public base URL under which stored uploads are served. For `local` this is
    // the static-mount prefix; for `s3` this is the bucket's public/CDN URL.
    UPLOAD_PUBLIC_BASE_URL: z.string().default("/uploads"),
    // S3 (or S3-compatible: R2, MinIO, ...) bucket config, required only when
    // STORAGE_PROVIDER=s3. Credentials are optional when the process has an
    // ambient IAM role/instance profile; when absent, the AWS SDK's default
    // credential chain is used.
    S3_BUCKET: z.string().min(1).optional(),
    S3_REGION: z.string().min(1).optional(),
    S3_ACCESS_KEY_ID: z.string().min(1).optional(),
    S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    // Override endpoint for S3-compatible providers; unset for real AWS S3.
    S3_ENDPOINT: z.string().min(1).optional(),
    // Food-vision providers for pantry scans. Both optional: when neither is set
    // (dev/test) scans degrade to an empty, manual-entry result — never a crash
    // and never fabricated detections. OpenAI is primary, Gemini the fallback.
    OPENAI_API_KEY: z.string().min(1).optional(),
    OPENAI_VISION_MODEL: z.string().min(1).default("gpt-4o-mini"),
    GEMINI_API_KEY: z.string().min(1).optional(),
    GEMINI_VISION_MODEL: z.string().min(1).default("gemini-1.5-flash"),
    // Hard cap on vision completion tokens, bounding per-scan AI cost.
    AI_VISION_MAX_TOKENS: z.coerce.number().int().positive().max(4096).default(800),
    // Text-LLM models for recipe suggestions and meal auto-fill. Reuse the same
    // OPENAI/GEMINI keys as vision; when neither key is set, suggestions and
    // auto-fill degrade to deterministic heuristics (never fabricated recipes).
    OPENAI_TEXT_MODEL: z.string().min(1).default("gpt-4o-mini"),
    GEMINI_TEXT_MODEL: z.string().min(1).default("gemini-1.5-flash"),
    // Hard cap on suggestion/auto-fill completion tokens, bounding per-call cost.
    AI_SUGGESTION_MAX_TOKENS: z.coerce
      .number()
      .int()
      .positive()
      .max(4096)
      .default(600),
    // Google Custom Search for external recipe web-search. Both optional: without
    // them, external search degrades to an empty, flagged result (never crashes,
    // never fabricates links).
    GOOGLE_SEARCH_API_KEY: z.string().min(1).optional(),
    GOOGLE_SEARCH_CX: z.string().min(1).optional(),
    // Socket.IO CORS allowlist (comma-separated origins). NO wildcard is ever
    // accepted: a browser origin must be listed explicitly. Empty = no browser
    // origin allowed (native clients that send no Origin header still connect).
    SOCKET_CORS_ORIGINS: z.string().optional(),
    // Expo push notifications. When disabled/unset, push fanout degrades to a
    // logged no-op (records are still created in-app). EXPO_ACCESS_TOKEN is
    // optional even when enabled (Expo accepts unauthenticated sends).
    EXPO_PUSH_ENABLED: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    EXPO_ACCESS_TOKEN: z.string().min(1).optional(),
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
    // The socket CORS allowlist must be set explicitly in production. Leaving it
    // empty is fail-closed (all browser origins rejected) but silently breaks
    // every web client, so require a deliberate value rather than a warn-only
    // fallback.
    if (!env.SOCKET_CORS_ORIGINS || env.SOCKET_CORS_ORIGINS.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SOCKET_CORS_ORIGINS"],
        message:
          "SOCKET_CORS_ORIGINS must list the allowed browser origins in production (no wildcard).",
      });
    }
    // Local disk storage does not survive a redeploy/restart on most container
    // platforms (Fly/Railway) and is never shared across instances, so it is
    // fail-closed in production: STORAGE_PROVIDER=s3 with a real bucket/region
    // is required.
    if (env.STORAGE_PROVIDER !== "s3") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["STORAGE_PROVIDER"],
        message: "STORAGE_PROVIDER must be 's3' in production.",
      });
    } else {
      if (!env.S3_BUCKET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["S3_BUCKET"],
          message: "S3_BUCKET is required in production when STORAGE_PROVIDER=s3.",
        });
      }
      if (!env.S3_REGION) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["S3_REGION"],
          message: "S3_REGION is required in production when STORAGE_PROVIDER=s3.",
        });
      }
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
