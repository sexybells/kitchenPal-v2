import { z } from "zod";

/** Supported locales at launch (structure supports 5; ja/zh/ko deferred). */
export const localeSchema = z.enum(["vi", "en"]);
export type Locale = z.infer<typeof localeSchema>;

/** Platform authorization roles. `user` is the default; `admin` is bootstrapped. */
export const roleSchema = z.enum(["user", "admin"]);
export type Role = z.infer<typeof roleSchema>;

export const emailSchema = z.string().email().max(254);
export const passwordSchema = z.string().min(8).max(128);
/** Loose E.164-style phone; exact carrier validation happens at send time. */
export const phoneSchema = z
  .string()
  .min(8)
  .max(20)
  .regex(/^\+?[0-9]{7,19}$/, "Phone must be digits, optionally prefixed with +");

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().min(1).max(80),
  // Locale is optional: when omitted the server resolves it from the request
  // (Accept-Language), never a hardcoded value, to avoid locale drift.
  locale: localeSchema.optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const verifyEmailSchema = z.object({
  token: z.string().min(1),
});
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

/** Generic OTP request/verify (phone or email channel). */
export const otpRequestSchema = z.object({
  channel: z.enum(["email", "phone"]),
  destination: z.string().min(3).max(254),
});
export type OtpRequestInput = z.infer<typeof otpRequestSchema>;

export const otpVerifySchema = otpRequestSchema.extend({
  code: z.string().length(6),
});
export type OtpVerifyInput = z.infer<typeof otpVerifySchema>;

/** Phone-OTP flows: request a code, verify a number, or log in with a code. */
export const requestPhoneOtpSchema = z.object({
  phone: phoneSchema,
});
export type RequestPhoneOtpInput = z.infer<typeof requestPhoneOtpSchema>;

export const verifyPhoneOtpSchema = z.object({
  phone: phoneSchema,
  code: z.string().length(6),
});
export type VerifyPhoneOtpInput = z.infer<typeof verifyPhoneOtpSchema>;

export const loginPhoneOtpSchema = verifyPhoneOtpSchema.extend({
  displayName: z.string().min(1).max(80).optional(),
  locale: localeSchema.optional(),
});
export type LoginPhoneOtpInput = z.infer<typeof loginPhoneOtpSchema>;

/** OAuth sign-in via provider identity token (Google / Apple). */
export const oauthSchema = z.object({
  provider: z.enum(["google", "apple"]),
  idToken: z.string().min(1),
});
export type OAuthInput = z.infer<typeof oauthSchema>;

/** Body for the dedicated `auth/google` and `auth/apple` endpoints. */
export const socialSignInSchema = z.object({
  idToken: z.string().min(1),
  locale: localeSchema.optional(),
});
export type SocialSignInInput = z.infer<typeof socialSignInSchema>;

/** Elevates a whitelisted account to `admin` using the bootstrap secret. */
export const adminBootstrapSchema = z.object({
  email: emailSchema,
  secret: z.string().min(1),
});
export type AdminBootstrapInput = z.infer<typeof adminBootstrapSchema>;

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

export const logoutSchema = z.object({
  refreshToken: z.string().min(1),
});
export type LogoutInput = z.infer<typeof logoutSchema>;

/** Public projection of a user account returned by auth/profile endpoints. */
export const userResponseSchema = z.object({
  id: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  roles: z.array(roleSchema),
  locale: localeSchema,
  emailVerified: z.boolean(),
  phoneVerified: z.boolean(),
  activeHouseholdId: z.string().nullable(),
  createdAt: z.string(),
});
export type UserResponse = z.infer<typeof userResponseSchema>;

/** Result of any successful authentication: the user plus a fresh token pair. */
export const authResultSchema = z.object({
  user: userResponseSchema,
  tokens: tokenPairSchema,
});
export type AuthResult = z.infer<typeof authResultSchema>;
