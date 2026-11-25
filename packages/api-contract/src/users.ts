import { z } from "zod";
import { localeSchema } from "./auth.js";

/** App-wide measurement preference; affects how quantities are presented. */
export const measurementSystemSchema = z.enum(["metric", "imperial"]);
export type MeasurementSystem = z.infer<typeof measurementSystemSchema>;

export const themePreferenceSchema = z.enum(["system", "light", "dark"]);
export type ThemePreference = z.infer<typeof themePreferenceSchema>;

/** Whether `value` is an IANA time zone name the runtime understands. */
export function isValidTimeZone(value: string): boolean {
  if (!value) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** An IANA time zone name such as `Asia/Ho_Chi_Minh`. */
export const timeZoneSchema = z
  .string()
  .refine(isValidTimeZone, { message: "Unknown time zone" });

/** Per-channel notification toggles. */
export const notificationSettingsSchema = z.object({
  push: z.boolean(),
  email: z.boolean(),
  mealReminders: z.boolean(),
  shoppingReminders: z.boolean(),
});
export type NotificationSettings = z.infer<typeof notificationSettingsSchema>;

/** Full user settings projection returned by the settings endpoints. */
export const userSettingsResponseSchema = z.object({
  locale: localeSchema,
  measurementSystem: measurementSystemSchema,
  theme: themePreferenceSchema,
  notifications: notificationSettingsSchema,
  // Device-side app-lock flag (biometric/PIN). The server only stores the user
  // preference; enforcement happens on the device.
  biometricLockEnabled: z.boolean(),
  /** Whether the user keeps lunar-calendar vegetarian days (1st and 15th). */
  observesVegetarianDays: z.boolean(),
  /** IANA zone used to decide the user's local date. */
  timeZone: z.string(),
});
export type UserSettingsResponse = z.infer<typeof userSettingsResponseSchema>;

/** Partial update of user settings; every field is optional. */
export const updateSettingsSchema = z
  .object({
    locale: localeSchema,
    measurementSystem: measurementSystemSchema,
    theme: themePreferenceSchema,
    notifications: notificationSettingsSchema.partial(),
    observesVegetarianDays: z.boolean(),
    timeZone: timeZoneSchema,
  })
  .partial();
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

export const biometricSettingSchema = z.object({
  enabled: z.boolean(),
});
export type BiometricSettingInput = z.infer<typeof biometricSettingSchema>;

/** Device push-notification registration token. */
export const pushTokenSchema = z.object({
  token: z.string().min(1).max(4096),
  platform: z.enum(["ios", "android", "web"]),
});
export type PushTokenInput = z.infer<typeof pushTokenSchema>;

/** One-time onboarding tips: which coach-marks the user has dismissed/seen. */
export const tipsStateResponseSchema = z.object({
  seen: z.array(z.string()),
  dismissedAll: z.boolean(),
});
export type TipsStateResponse = z.infer<typeof tipsStateResponseSchema>;

export const updateTipsSchema = z
  .object({
    seen: z.array(z.string().min(1).max(120)).max(200),
    dismissedAll: z.boolean(),
  })
  .partial();
export type UpdateTipsInput = z.infer<typeof updateTipsSchema>;

/** Response of a successful avatar upload. */
export const avatarUploadResponseSchema = z.object({
  avatarUrl: z.string(),
});
export type AvatarUploadResponse = z.infer<typeof avatarUploadResponseSchema>;
