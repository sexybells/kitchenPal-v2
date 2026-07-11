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
    // Consumed by the authentication phase; optional until then.
    JWT_ACCESS_SECRET: z.string().min(1).optional(),
    JWT_REFRESH_SECRET: z.string().min(1).optional(),
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
