import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";
import type { SubscriptionTier } from "@kitchenpal/api-contract";
import { baseSchemaPlugin } from "../../../common/database/base.schema";

export type SubscriptionPlanDocument = HydratedDocument<SubscriptionPlan>;

/**
 * A subscription plan an admin can create and assign. Prices are stored in whole
 * Vietnamese dong (VND); there is no self-serve purchase in v1, so a plan is
 * purely descriptive metadata plus the tier it grants.
 */
@Schema({ collection: "subscription_plans" })
export class SubscriptionPlan {
  @Prop({ type: String, required: true, trim: true })
  name!: string;

  @Prop({ type: String, enum: ["free", "pro"], required: true, index: true })
  tier!: SubscriptionTier;

  @Prop({ type: Number, required: true, default: 0, min: 0 })
  priceVnd!: number;

  @Prop({ type: [String], default: [] })
  features!: string[];

  @Prop({ type: Boolean, default: true, index: true })
  active!: boolean;
}

export const SubscriptionPlanSchema =
  SchemaFactory.createForClass(SubscriptionPlan);
SubscriptionPlanSchema.plugin(baseSchemaPlugin);
