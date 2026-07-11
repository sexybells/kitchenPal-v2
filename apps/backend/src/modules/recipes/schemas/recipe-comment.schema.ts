import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";
import {
  baseSchemaPlugin,
  scopedSchemaPlugin,
} from "../../../common/database/base.schema";

export type RecipeCommentDocument = HydratedDocument<RecipeComment>;

/**
 * A rating (1..5) and optional review text a user left on a recipe. Comments are
 * personal-scoped and owned via `createdBy`, but reference a recipe that may be
 * community/system content; the recipe's `averageRating`/`reviewCount` are
 * recomputed from all comments on post.
 */
@Schema({ collection: "recipe_comments" })
export class RecipeComment {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  recipeId!: Types.ObjectId;

  @Prop({ type: Number, required: true, min: 1, max: 5 })
  rating!: number;

  @Prop({ type: String, default: null })
  text!: string | null;

  /**
   * Author's display name, denormalized at write time. Reviews expose this
   * rather than the raw author user id so internal ids are not leaked to every
   * reader of the public reviews feed.
   */
  @Prop({ type: String, default: "" })
  authorName!: string;
}

export const RecipeCommentSchema = SchemaFactory.createForClass(RecipeComment);
RecipeCommentSchema.plugin(baseSchemaPlugin);
RecipeCommentSchema.plugin(scopedSchemaPlugin);

// One rating per user per recipe: a user's repeat rating updates their existing
// one instead of stacking. Partial on live docs so a soft-deleted rating does
// not block a fresh one, and so `reviewCount` counts distinct reviewers.
RecipeCommentSchema.index(
  { recipeId: 1, createdBy: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
