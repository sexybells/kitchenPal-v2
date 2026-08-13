import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";
import { baseSchemaPlugin } from "../../../common/database/base.schema";

export type CommunityUserBlockDocument =
  HydratedDocument<CommunityUserBlock>;

/**
 * A block one user places on another: the blocker is `createdBy`, the target is
 * `blockedUserId`. The feed hides posts authored by anyone the caller has
 * blocked. A partial-unique index on live rows makes blocking idempotent.
 */
@Schema({ collection: "community_user_blocks" })
export class CommunityUserBlock {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  blockedUserId!: Types.ObjectId;
}

export const CommunityUserBlockSchema =
  SchemaFactory.createForClass(CommunityUserBlock);
CommunityUserBlockSchema.plugin(baseSchemaPlugin);

// One live block per (blocker, blocked) pair. Partial on live rows so a prior
// unblock (soft-delete) does not prevent blocking the same user again.
CommunityUserBlockSchema.index(
  { createdBy: 1, blockedUserId: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
