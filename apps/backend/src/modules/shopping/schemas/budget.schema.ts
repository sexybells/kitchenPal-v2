import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";
import type { Currency } from "@kitchenpal/api-contract";
import {
  baseSchemaPlugin,
  scopedSchemaPlugin,
} from "../../../common/database/base.schema";

export type BudgetDocument = HydratedDocument<Budget>;

/**
 * A spending budget for one 30-day cycle, scope-partitioned and owned via
 * `createdBy`. `spent` is deducted atomically (`$inc`) as expenses are logged and
 * refunded on delete, so concurrent expenses never lose an update. All money is
 * INTEGER đồng. The base `version` guards edits to `amount`/cycle only — `spent`
 * uses the atomic counter path deliberately, not the version guard.
 */
@Schema({ collection: "budgets" })
export class Budget {
  @Prop({ type: Number, required: true, min: 0 })
  amount!: number;

  @Prop({ type: Number, required: true, default: 0 })
  spent!: number;

  @Prop({ type: String, required: true, default: "VND" })
  currency!: Currency;

  @Prop({ type: Date, required: true, index: true })
  cycleStart!: Date;

  @Prop({ type: Date, required: true, index: true })
  cycleEnd!: Date;
}

export const BudgetSchema = SchemaFactory.createForClass(Budget);
BudgetSchema.plugin(baseSchemaPlugin);
BudgetSchema.plugin(scopedSchemaPlugin);

// One live budget per cycle within a scope, backing the application-level overlap
// check with a DB constraint so two concurrent creates on the same UTC day (which
// produce an identical deterministic cycle window) cannot BOTH commit. A personal
// budget is unique per creator; a household budget is unique per household. The
// service still runs findOverlapping for the friendly message and then treats a
// duplicate-key error as the same 409 CONFLICT.
BudgetSchema.index(
  { cycleStart: 1, createdBy: 1 },
  {
    unique: true,
    partialFilterExpression: { deletedAt: null, scope: "personal" },
  },
);
BudgetSchema.index(
  { cycleStart: 1, householdId: 1 },
  {
    unique: true,
    partialFilterExpression: { deletedAt: null, scope: "household" },
  },
);
