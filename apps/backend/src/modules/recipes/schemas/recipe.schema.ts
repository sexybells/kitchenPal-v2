import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";
import type { MealType, RecipeSourceType } from "@kitchenpal/api-contract";
import {
  baseSchemaPlugin,
  scopedSchemaPlugin,
} from "../../../common/database/base.schema";

export type RecipeDocument = HydratedDocument<Recipe>;

/** One ingredient line embedded in a {@link Recipe}. */
@Schema({ _id: false })
export class RecipeIngredientItem {
  @Prop({ type: String, required: true, trim: true })
  name!: string;

  @Prop({ type: Number, default: null })
  quantity!: number | null;

  @Prop({ type: String, default: null })
  unit!: string | null;

  @Prop({ type: Boolean, default: false })
  optional!: boolean;
}

export const RecipeIngredientItemSchema =
  SchemaFactory.createForClass(RecipeIngredientItem);

/**
 * A recipe. Scope-partitioned (`personal | household | system`) and owned via
 * `createdBy`. `published` promotes a personal/household recipe into the shared
 * community feed; `system` recipes are server-owned seed content. `normalizedName`
 * is a lowercased key for case-insensitive lookup and duplicate detection.
 */
@Schema({ collection: "recipes" })
export class Recipe {
  @Prop({ type: String, required: true, trim: true })
  name!: string;

  @Prop({ type: String, required: true, index: true })
  normalizedName!: string;

  @Prop({
    type: String,
    enum: ["breakfast", "lunch", "dinner", "snack"],
    required: true,
    default: "dinner",
    index: true,
  })
  mealType!: MealType;

  @Prop({ type: [String], default: [], index: true })
  tags!: string[];

  @Prop({ type: Number, default: null })
  cookTimeMinutes!: number | null;

  @Prop({ type: Number, default: null })
  servings!: number | null;

  @Prop({ type: [RecipeIngredientItemSchema], default: [] })
  ingredients!: RecipeIngredientItem[];

  @Prop({ type: [String], default: [] })
  steps!: string[];

  @Prop({
    type: String,
    enum: ["manual", "import", "ai", "system"],
    required: true,
    default: "manual",
  })
  sourceType!: RecipeSourceType;

  @Prop({ type: String, default: null })
  imageUrl!: string | null;

  @Prop({ type: Number, default: 0, min: 0, max: 5 })
  averageRating!: number;

  @Prop({ type: Number, default: 0, min: 0 })
  reviewCount!: number;

  @Prop({ type: Number, default: 0, min: 0 })
  viewCount!: number;

  @Prop({ type: Boolean, default: false, index: true })
  published!: boolean;

  @Prop({ type: String, default: null })
  sourceUrl!: string | null;
}

export const RecipeSchema = SchemaFactory.createForClass(Recipe);
RecipeSchema.plugin(baseSchemaPlugin);
RecipeSchema.plugin(scopedSchemaPlugin);
