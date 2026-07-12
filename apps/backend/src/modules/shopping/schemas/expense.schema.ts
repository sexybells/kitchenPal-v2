import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";
import type { Currency, ExpenseCategory } from "@kitchenpal/api-contract";
import {
  baseSchemaPlugin,
  scopedSchemaPlugin,
} from "../../../common/database/base.schema";

export type ExpenseDocument = HydratedDocument<Expense>;

/**
 * One line embedded in an {@link Expense}. `unitPrice` is server-derived
 * (`round(total / quantity)`) in whole đồng and is the raw material for the
 * price-history trend.
 */
@Schema({ _id: false })
export class ExpenseItem {
  @Prop({ type: String, required: true, trim: true })
  name!: string;

  @Prop({ type: String, required: true, index: true })
  normalizedName!: string;

  @Prop({ type: Number, required: true })
  quantity!: number;

  @Prop({ type: Number, required: true })
  unitPrice!: number;

  @Prop({ type: Number, required: true })
  total!: number;
}

export const ExpenseItemSchema = SchemaFactory.createForClass(ExpenseItem);

/**
 * A logged expense, scope-partitioned and owned via `createdBy`. All money is
 * INTEGER đồng (VND has no minor unit) so there is no floating-point drift.
 * `budgetId` records which budget cycle this expense deducted, so a later delete
 * refunds exactly that budget's `spent`.
 */
@Schema({ collection: "expenses" })
export class Expense {
  @Prop({ type: Number, required: true, min: 0 })
  totalAmount!: number;

  @Prop({ type: String, required: true, default: "VND" })
  currency!: Currency;

  @Prop({
    type: String,
    enum: ["groceries", "dining", "household", "other"],
    required: true,
    default: "groceries",
    index: true,
  })
  category!: ExpenseCategory;

  @Prop({ type: String, default: null })
  note!: string | null;

  @Prop({ type: Date, required: true, index: true })
  date!: Date;

  @Prop({ type: SchemaTypes.ObjectId, default: null })
  shoppingListId!: Types.ObjectId | null;

  @Prop({ type: SchemaTypes.ObjectId, default: null, index: true })
  budgetId!: Types.ObjectId | null;

  @Prop({ type: [ExpenseItemSchema], default: [] })
  items!: ExpenseItem[];
}

export const ExpenseSchema = SchemaFactory.createForClass(Expense);
ExpenseSchema.plugin(baseSchemaPlugin);
ExpenseSchema.plugin(scopedSchemaPlugin);
