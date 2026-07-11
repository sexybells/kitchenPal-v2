import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";
import { baseSchemaPlugin } from "../../../common/database/base.schema";

export type AiLogDocument = HydratedDocument<AiLog>;

/**
 * Audit trail for AI provider calls (vision, suggestions, meal auto-fill).
 * Schema-only stub; feature phases write to it. `request`/`response` capture
 * redacted payloads for debugging and cost tracking.
 */
@Schema({ collection: "ai_logs" })
export class AiLog {
  @Prop({ required: true })
  provider!: string;

  @Prop({ required: true })
  operation!: string;

  @Prop({ type: SchemaTypes.Mixed })
  request?: Record<string, unknown>;

  @Prop({ type: SchemaTypes.Mixed })
  response?: Record<string, unknown>;

  @Prop()
  latencyMs?: number;

  @Prop({ default: true })
  success!: boolean;

  @Prop({ type: SchemaTypes.ObjectId })
  userId?: Types.ObjectId;
}

export const AiLogSchema = SchemaFactory.createForClass(AiLog);
AiLogSchema.plugin(baseSchemaPlugin);
