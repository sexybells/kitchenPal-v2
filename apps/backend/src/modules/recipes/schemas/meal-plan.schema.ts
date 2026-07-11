import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";
import type { MealType } from "@kitchenpal/api-contract";
import {
  baseSchemaPlugin,
  scopedSchemaPlugin,
} from "../../../common/database/base.schema";

export type MealPlanDocument = HydratedDocument<MealPlan>;

/** One meal slot embedded in a {@link MealPlan}. Empty when `recipeId` is null. */
@Schema({ _id: false })
export class MealPlanSlotItem {
  @Prop({ type: String, required: true })
  id!: string;

  @Prop({ type: Number, required: true, min: 0, max: 6 })
  dayOfWeek!: number;

  @Prop({
    type: String,
    enum: ["breakfast", "lunch", "dinner", "snack"],
    required: true,
  })
  mealType!: MealType;

  @Prop({ type: SchemaTypes.ObjectId, default: null })
  recipeId!: Types.ObjectId | null;
}

export const MealPlanSlotItemSchema =
  SchemaFactory.createForClass(MealPlanSlotItem);

/**
 * A weekly meal plan: fixed slots (day × meal type) each optionally referencing
 * a recipe. Scope-partitioned and owned via `createdBy`. The base `version`
 * field provides optimistic-concurrency for atomic, lost-update-safe slot edits.
 */
@Schema({ collection: "meal_plans" })
export class MealPlan {
  @Prop({ type: Date, required: true, index: true })
  weekStart!: Date;

  @Prop({ type: [MealPlanSlotItemSchema], default: [] })
  slots!: MealPlanSlotItem[];
}

export const MealPlanSchema = SchemaFactory.createForClass(MealPlan);
MealPlanSchema.plugin(baseSchemaPlugin);
MealPlanSchema.plugin(scopedSchemaPlugin);

// One live plan per owner per week, so a concurrent double-create cannot insert
// duplicate plans for the same week (the service returns the existing one).
MealPlanSchema.index(
  { createdBy: 1, weekStart: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
