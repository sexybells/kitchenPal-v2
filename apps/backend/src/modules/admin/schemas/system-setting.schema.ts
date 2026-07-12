import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes } from "mongoose";
import { baseSchemaPlugin } from "../../../common/database/base.schema";

export type SystemSettingDocument = HydratedDocument<SystemSetting>;

/**
 * An integration toggle (AI/email/SMS/push/storage/external-search). `config`
 * holds ONLY non-secret values (provider names, model ids, feature flags).
 * Secrets stay in environment variables and are never written here — the admin
 * settings API strips secret-looking keys on write and never echoes env secrets.
 */
@Schema({ collection: "system_settings" })
export class SystemSetting {
  @Prop({ type: String, required: true, unique: true, index: true })
  key!: string;

  @Prop({ type: Boolean, required: true, default: false })
  enabled!: boolean;

  @Prop({ type: SchemaTypes.Mixed, default: {} })
  config!: Record<string, unknown>;
}

export const SystemSettingSchema = SchemaFactory.createForClass(SystemSetting);
SystemSettingSchema.plugin(baseSchemaPlugin);
