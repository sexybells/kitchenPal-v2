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

// One rating per recipe within a scope: a repeat rating updates the existing one
// instead of stacking. A personal rating is unique per creator; a household
// rating is unique per HOUSEHOLD — the household leaves one shared review per
// recipe. Partial on live docs so a soft-deleted rating does not block a fresh
// one, and scoped so a personal rating and a household rating of the same recipe
// stay independent (separate buckets).
RecipeCommentSchema.index(
  { recipeId: 1, createdBy: 1 },
  {
    unique: true,
    partialFilterExpression: { deletedAt: null, scope: "personal" },
  },
);
RecipeCommentSchema.index(
  { recipeId: 1, householdId: 1 },
  {
    unique: true,
    partialFilterExpression: { deletedAt: null, scope: "household" },
  },
);
