import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";
import type {
  SubscriptionSource,
  SubscriptionStatus,
} from "@kitchenpal/api-contract";
import { baseSchemaPlugin } from "../../../common/database/base.schema";

export type UserSubscriptionDocument = HydratedDocument<UserSubscription>;

/**
 * A user's subscription to a plan. In v1 the only writer is the admin assignment
 * path (`source=admin`); users cannot self-purchase. At most one `active` row
 * per user is expected — assigning a new plan cancels the previous active one.
 */
@Schema({ collection: "user_subscriptions" })
export class UserSubscription {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, required: true })
  planId!: Types.ObjectId;

  @Prop({
    type: String,
    enum: ["active", "canceled", "expired"],
    required: true,
    default: "active",
    index: true,
  })
  status!: SubscriptionStatus;

  @Prop({ type: String, enum: ["admin", "system"], required: true, default: "admin" })
  source!: SubscriptionSource;

  @Prop({ type: Date, required: true, default: () => new Date() })
  startAt!: Date;

  @Prop({ type: Date, default: null })
  endAt!: Date | null;
}

export const UserSubscriptionSchema =
  SchemaFactory.createForClass(UserSubscription);
UserSubscriptionSchema.plugin(baseSchemaPlugin);
UserSubscriptionSchema.index({ userId: 1, status: 1 });
