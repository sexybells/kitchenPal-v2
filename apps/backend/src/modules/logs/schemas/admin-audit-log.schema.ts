import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";
import { baseSchemaPlugin } from "../../../common/database/base.schema";

export type AdminAuditLogDocument = HydratedDocument<AdminAuditLog>;

/**
 * Immutable record of privileged admin actions (plan assignment, moderation,
 * config changes). Schema-only stub; the admin phase writes to it.
 */
@Schema({ collection: "admin_audit_logs" })
export class AdminAuditLog {
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  actorId!: Types.ObjectId;

  @Prop({ required: true })
  action!: string;

  @Prop()
  targetType?: string;

  @Prop({ type: SchemaTypes.ObjectId })
  targetId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.Mixed })
  metadata?: Record<string, unknown>;

  @Prop()
  ip?: string;
}

export const AdminAuditLogSchema = SchemaFactory.createForClass(AdminAuditLog);
AdminAuditLogSchema.plugin(baseSchemaPlugin);
