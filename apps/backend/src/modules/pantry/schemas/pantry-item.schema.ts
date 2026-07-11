import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";
import type {
  ConfidenceState,
  PantryItemSource,
  StockState,
  TrackingMode,
} from "@kitchenpal/api-contract";
import {
  baseSchemaPlugin,
  scopedSchemaPlugin,
} from "../../../common/database/base.schema";

export type PantryItemDocument = HydratedDocument<PantryItem>;

/**
 * A single thing in the kitchen. Scope-partitioned (personal or household) and
 * owned via `createdBy`. `stockState` is the assistive source of truth; a
 * numeric `quantity`/`unit` is only meaningful for quantity-tracked items.
 */
@Schema({ collection: "pantry_items" })
export class PantryItem {
  @Prop({ type: String, required: true, trim: true })
  name!: string;

  @Prop({ type: String, required: true, trim: true, index: true })
  category!: string;

  @Prop({ type: Number, default: 0, min: 0 })
  quantity!: number;

  @Prop({ type: String, default: null })
  unit!: string | null;

  @Prop({
    type: String,
    enum: ["plenty", "some", "low", "out"],
    required: true,
    default: "plenty",
    index: true,
  })
  stockState!: StockState;

  @Prop({
    type: String,
    enum: ["state_only", "household_unit", "exact"],
    required: true,
    default: "state_only",
  })
  trackingMode!: TrackingMode;

  @Prop({
    type: String,
    enum: ["confirmed", "estimated", "low"],
    required: true,
    default: "confirmed",
  })
  confidenceState!: ConfidenceState;

  @Prop({
    type: String,
    enum: ["manual", "scan", "refill"],
    required: true,
    default: "manual",
  })
  source!: PantryItemSource;

  @Prop({ type: Date, default: null, index: true })
  expiryDate!: Date | null;
}

export const PantryItemSchema = SchemaFactory.createForClass(PantryItem);
PantryItemSchema.plugin(baseSchemaPlugin);
PantryItemSchema.plugin(scopedSchemaPlugin);
