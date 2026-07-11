import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";
import {
  baseSchemaPlugin,
  scopedSchemaPlugin,
} from "../../../common/database/base.schema";

export type RecipePreferenceDocument = HydratedDocument<RecipePreference>;

/**
 * Per-user dietary preferences that steer AI suggestions and meal auto-fill.
 * Scope-partitioned and owned via `createdBy`; there is at most one live
 * document per owner within a scope.
 */
@Schema({ collection: "recipe_preferences" })
export class RecipePreference {
  @Prop({ type: String, default: null })
  diet!: string | null;

  @Prop({ type: [String], default: [] })
  allergens!: string[];

  @Prop({ type: [String], default: [] })
  disliked!: string[];

  @Prop({ type: [String], default: [] })
  cuisines!: string[];
}

export const RecipePreferenceSchema =
  SchemaFactory.createForClass(RecipePreference);
RecipePreferenceSchema.plugin(baseSchemaPlugin);
RecipePreferenceSchema.plugin(scopedSchemaPlugin);
