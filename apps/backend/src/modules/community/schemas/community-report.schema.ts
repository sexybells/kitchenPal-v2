import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";
import type {
  CommunityReportReason,
  CommunityReportStatus,
} from "@kitchenpal/api-contract";
import { baseSchemaPlugin } from "../../../common/database/base.schema";

export type CommunityReportDocument = HydratedDocument<CommunityReport>;

/**
 * A moderation report filed against a post or comment. The reporter is
 * `createdBy`. `status` moves `open` → `reviewed` (admin removed the target) or
 * `dismissed` (admin cleared it). Admins list and resolve these from the console.
 */
@Schema({ collection: "community_reports" })
export class CommunityReport {
  @Prop({ type: String, required: true, enum: ["post", "comment"] })
  targetType!: "post" | "comment";

  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  targetId!: Types.ObjectId;

  @Prop({
    type: String,
    required: true,
    enum: ["spam", "offensive", "harassment", "inappropriate", "other"],
  })
  reason!: CommunityReportReason;

  @Prop({ type: String, default: null })
  detail!: string | null;

  @Prop({
    type: String,
    required: true,
    default: "open",
    enum: ["open", "reviewed", "dismissed"],
    index: true,
  })
  status!: CommunityReportStatus;
}

export const CommunityReportSchema =
  SchemaFactory.createForClass(CommunityReport);
CommunityReportSchema.plugin(baseSchemaPlugin);

// The admin queue lists reports by status, newest first.
CommunityReportSchema.index({ status: 1, createdAt: -1 });
