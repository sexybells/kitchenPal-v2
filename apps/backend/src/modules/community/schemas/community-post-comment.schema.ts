import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";
import { baseSchemaPlugin } from "../../../common/database/base.schema";

export type CommunityPostCommentDocument =
  HydratedDocument<CommunityPostComment>;

/**
 * A flat comment on a community post (no nested replies in v1). The author is
 * `createdBy`; `authorName`/`authorAvatarUrl` are denormalized at write time so
 * readers never resolve internal user ids.
 */
@Schema({ collection: "community_post_comments" })
export class CommunityPostComment {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  postId!: Types.ObjectId;

  @Prop({ type: String, default: "" })
  authorName!: string;

  @Prop({ type: String, default: null })
  authorAvatarUrl!: string | null;

  @Prop({ type: String, required: true })
  text!: string;
}

export const CommunityPostCommentSchema = SchemaFactory.createForClass(
  CommunityPostComment,
);
CommunityPostCommentSchema.plugin(baseSchemaPlugin);

// A post's comments are listed newest-first.
CommunityPostCommentSchema.index({ postId: 1, createdAt: -1 });
