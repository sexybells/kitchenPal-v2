import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";
import { baseSchemaPlugin } from "../../../common/database/base.schema";

export type ExternalSearchLogDocument = HydratedDocument<ExternalSearchLog>;

/**
 * Audit trail for outbound external calls that are not AI provider calls:
 * recipe web-search (Google Custom Search) and URL scraping for import. Mirrors
 * {@link AiLog} — global by design so reliability/cost tracking spans all users.
 * `query`/`url` capture the request; `response` a redacted summary. Never store
 * secrets or full page bodies.
 */
@Schema({ collection: "external_search_logs" })
export class ExternalSearchLog {
  @Prop({ required: true })
  provider!: string;

  @Prop({ required: true })
  operation!: string;

  @Prop({ type: String, default: null })
  query!: string | null;

  @Prop({ type: String, default: null })
  url!: string | null;

  @Prop({ type: SchemaTypes.Mixed })
  response?: Record<string, unknown>;

  @Prop()
  latencyMs?: number;

  @Prop({ default: true })
  success!: boolean;

  @Prop({ type: SchemaTypes.ObjectId })
  userId?: Types.ObjectId;
}

export const ExternalSearchLogSchema =
  SchemaFactory.createForClass(ExternalSearchLog);
ExternalSearchLogSchema.plugin(baseSchemaPlugin);
