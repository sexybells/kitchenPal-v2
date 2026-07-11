import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";
import type {
  Locale,
  MeasurementSystem,
  NotificationSettings,
  ThemePreference,
} from "@kitchenpal/api-contract";
import {
  baseSchemaPlugin,
  scopedSchemaPlugin,
} from "../../../common/database/base.schema";

export type UserSettingsDocument = HydratedDocument<UserSettings>;

/** Embedded per-channel notification toggles. */
@Schema({ _id: false })
export class NotificationPrefs {
  @Prop({ default: true })
  push!: boolean;

  @Prop({ default: true })
  email!: boolean;

  @Prop({ default: true })
  mealReminders!: boolean;

  @Prop({ default: true })
  shoppingReminders!: boolean;
}

export const NotificationPrefsSchema =
  SchemaFactory.createForClass(NotificationPrefs);

/** A registered device push token embedded in {@link UserSettings}. */
@Schema({ _id: false })
export class DevicePushToken {
  @Prop({ type: String, required: true })
  token!: string;

  @Prop({ type: String, required: true, enum: ["ios", "android", "web"] })
  platform!: "ios" | "android" | "web";
}

export const DevicePushTokenSchema =
  SchemaFactory.createForClass(DevicePushToken);

/**
 * A user's application preferences. Personal-scoped and owned via `createdBy`
 * (there is exactly one document per user). Locale is stored as a code, in sync
 * with the account locale, to keep a single source of truth.
 */
@Schema({ collection: "user_settings" })
export class UserSettings {
  @Prop({ type: String, required: true, default: "vi" })
  locale!: Locale;

  @Prop({ type: String, required: true, default: "metric" })
  measurementSystem!: MeasurementSystem;

  @Prop({ type: String, required: true, default: "system" })
  theme!: ThemePreference;

  @Prop({ type: NotificationPrefsSchema, default: () => ({}) })
  notifications!: NotificationSettings;

  /** Device-side app-lock preference (biometric/PIN). Enforced on the device. */
  @Prop({ default: false })
  biometricLockEnabled!: boolean;

  @Prop({ type: [DevicePushTokenSchema], default: [] })
  pushTokens!: DevicePushToken[];
}

export const UserSettingsSchema = SchemaFactory.createForClass(UserSettings);
UserSettingsSchema.plugin(baseSchemaPlugin);
UserSettingsSchema.plugin(scopedSchemaPlugin);
