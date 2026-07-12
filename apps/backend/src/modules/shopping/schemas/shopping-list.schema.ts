import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";
import {
  baseSchemaPlugin,
  scopedSchemaPlugin,
} from "../../../common/database/base.schema";

export type ShoppingListDocument = HydratedDocument<ShoppingList>;

/** One line embedded in a {@link ShoppingList}. `id` is stable across edits. */
@Schema({ _id: false })
export class ShoppingItem {
  @Prop({ type: String, required: true })
  id!: string;

  @Prop({ type: String, required: true, trim: true })
  name!: string;

  @Prop({ type: Number, default: null })
  quantity!: number | null;

  @Prop({ type: String, default: null })
  unit!: string | null;

  @Prop({ type: String, default: null })
  category!: string | null;

  @Prop({ type: Boolean, default: false })
  bought!: boolean;

  @Prop({ type: SchemaTypes.ObjectId, default: null })
  sourceRecipeId!: Types.ObjectId | null;
}

export const ShoppingItemSchema = SchemaFactory.createForClass(ShoppingItem);

/**
 * A shopping list, scope-partitioned and owned via `createdBy`. A list may be
 * generated from a meal plan (`mealPlanId`) or ad-hoc (`mealPlanId` null). The
 * base `version` field provides optimistic concurrency so two shoppers toggling
 * `bought` or editing items on a shared list cannot silently lose each other's
 * writes — a stale write is rejected with a conflict.
 */
@Schema({ collection: "shopping_lists" })
export class ShoppingList {
  @Prop({ type: SchemaTypes.ObjectId, default: null })
  mealPlanId!: Types.ObjectId | null;

  @Prop({ type: [ShoppingItemSchema], default: [] })
  items!: ShoppingItem[];
}

export const ShoppingListSchema = SchemaFactory.createForClass(ShoppingList);
ShoppingListSchema.plugin(baseSchemaPlugin);
ShoppingListSchema.plugin(scopedSchemaPlugin);

// At most one live list per meal plan, so regenerating a plan's list merges into
// the same document rather than spawning duplicates. Personal ad-hoc lists have
// mealPlanId null and are exempt (partial index only covers real plan ids).
ShoppingListSchema.index(
  { mealPlanId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      deletedAt: null,
      mealPlanId: { $type: "objectId" },
    },
  },
);
