import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";
import { baseSchemaPlugin } from "../../../common/database/base.schema";

export type CommunityPostDocument = HydratedDocument<CommunityPost>;

/**
 * A public community post. Unlike recipes/pantry, community content is
 * global/public (every user sees every non-deleted post), so it uses
 * `baseSchemaPlugin` only — the author is `createdBy`. `authorName`/
 * `authorAvatarUrl` are denormalized at write time (mirrors
 * `recipe-comment.authorName`) so a reader never resolves internal user ids.
 * `recipeTitle` is likewise denormalized from the attached recipe. `likeCount`
 * and `commentCount` are derived counters maintained atomically via `$inc`.
 */
@Schema({ collection: "community_posts" })
export class CommunityPost {
  @Prop({ type: String, default: "" })
  authorName!: string;

  @Prop({ type: String, default: null })
  authorAvatarUrl!: string | null;

  @Prop({ type: String, default: "" })
  caption!: string;

  @Prop({ type: [String], default: [] })
  images!: string[];

  @Prop({ type: SchemaTypes.ObjectId, default: null })
  recipeId!: Types.ObjectId | null;

  @Prop({ type: String, default: null })
  recipeTitle!: string | null;

  @Prop({ type: Number, default: 0, min: 0 })
  likeCount!: number;

  @Prop({ type: Number, default: 0, min: 0 })
  commentCount!: number;
}

export const CommunityPostSchema = SchemaFactory.createForClass(CommunityPost);
CommunityPostSchema.plugin(baseSchemaPlugin);

// The feed is newest-first over live posts, optionally narrowed to one author
// (profile screens). A compound index on the author + recency serves both the
// global feed (via the recency key) and the per-author listing.
CommunityPostSchema.index({ createdBy: 1, createdAt: -1 });
CommunityPostSchema.index({ createdAt: -1 });
