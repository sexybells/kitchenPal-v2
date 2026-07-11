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

// One live favorite per user per recipe, so a concurrent double-favorite cannot
// insert duplicate rows (which would list the recipe twice).
RecipeFavoriteSchema.index(
  { recipeId: 1, createdBy: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
