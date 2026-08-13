import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";
import { baseSchemaPlugin } from "../../../common/database/base.schema";

export type CommunityPostLikeDocument = HydratedDocument<CommunityPostLike>;

/**
 * One user's like on a post. The liker is `createdBy` (never a client-supplied
 * id). A partial-unique index on live rows enforces one like per user per post,
 * so a repeat like is idempotent and cannot inflate the post's `likeCount`.
 */
@Schema({ collection: "community_post_likes" })
export class CommunityPostLike {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  postId!: Types.ObjectId;
}

export const CommunityPostLikeSchema =
  SchemaFactory.createForClass(CommunityPostLike);
CommunityPostLikeSchema.plugin(baseSchemaPlugin);

// One like per user per post. Partial on live rows so a soft-deleted (unliked)
// like does not block the user liking again later.
CommunityPostLikeSchema.index(
  { postId: 1, createdBy: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
