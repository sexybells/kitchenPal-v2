import { z } from "zod";

/** Supported locales at launch (structure supports 5; ja/zh/ko deferred). */
export const localeSchema = z.enum(["vi", "en"]);
export type Locale = z.infer<typeof localeSchema>;

export const emailSchema = z.string().email().max(254);
export const passwordSchema = z.string().min(8).max(128);

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().min(1).max(80),
  locale: localeSchema.default("vi"),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});
export type LoginInput = z.infer<typeof loginSchema>;

/** OTP request/verify (phone or email channel). */
export const otpRequestSchema = z.object({
  channel: z.enum(["email", "phone"]),
  destination: z.string().min(3).max(254),
});
export type OtpRequestInput = z.infer<typeof otpRequestSchema>;

export const otpVerifySchema = otpRequestSchema.extend({
  code: z.string().length(6),
});
export type OtpVerifyInput = z.infer<typeof otpVerifySchema>;

/** OAuth sign-in via provider identity token (Google / Apple). */
export const oauthSchema = z.object({
  provider: z.enum(["google", "apple"]),
  idToken: z.string().min(1),
});
export type OAuthInput = z.infer<typeof oauthSchema>;

/** Token pair returned by all auth flows. Access 15m / refresh 90d rotation. */
export const tokenPairSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().int().positive(),
});
export type TokenPair = z.infer<typeof tokenPairSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshInput = z.infer<typeof refreshSchema>;
