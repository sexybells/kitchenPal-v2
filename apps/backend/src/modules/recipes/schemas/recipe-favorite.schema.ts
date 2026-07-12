import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";
import {
  baseSchemaPlugin,
  scopedSchemaPlugin,
} from "../../../common/database/base.schema";

export type RecipeFavoriteDocument = HydratedDocument<RecipeFavorite>;

/**
 * A user's favorite marker for a recipe. Scope-partitioned and owned via
 * `createdBy`; `recipeId` can reference any recipe the user could read
 * (own, community, or system).
 */
@Schema({ collection: "recipe_favorites" })
export class RecipeFavorite {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  recipeId!: Types.ObjectId;
}

export const RecipeFavoriteSchema =
  SchemaFactory.createForClass(RecipeFavorite);
RecipeFavoriteSchema.plugin(baseSchemaPlugin);
RecipeFavoriteSchema.plugin(scopedSchemaPlugin);

// One live favorite per recipe within a scope, so a concurrent double-favorite
// cannot insert duplicate rows (which would list the recipe twice). A personal
// favorite is unique per creator; a household favorite is unique per HOUSEHOLD —
// the household shares one favorites list, so any member favoriting a recipe
// converges on the single shared marker rather than a per-member duplicate.
// Scoping the key also keeps a user's personal favorite and their household's
// favorite of the same recipe as two independent rows (separate buckets).
RecipeFavoriteSchema.index(
  { recipeId: 1, createdBy: 1 },
  {
    unique: true,
    partialFilterExpression: { deletedAt: null, scope: "personal" },
  },
);
RecipeFavoriteSchema.index(
  { recipeId: 1, householdId: 1 },
  {
    unique: true,
    partialFilterExpression: { deletedAt: null, scope: "household" },
  },
);
