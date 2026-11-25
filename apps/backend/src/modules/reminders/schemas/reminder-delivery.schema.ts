import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";
import { baseSchemaPlugin } from "../../../common/database/base.schema";

export type ReminderDeliveryDocument = HydratedDocument<ReminderDelivery>;

/** How long a delivery claim is kept; only today's row matters for dedupe. */
const RETENTION_SECONDS = 30 * 24 * 60 * 60;

/**
 * Claim that a user got their daily reminder for a local date. Inserted BEFORE
 * the push is sent; the unique `(userId, localDate)` index is what makes the
 * reminder at-most-once per day across ticks, retries and instances.
 */
@Schema({ collection: "reminder_deliveries" })
export class ReminderDelivery {
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  userId!: Types.ObjectId;

  /** The user's local date, `YYYY-MM-DD`. */
  @Prop({ type: String, required: true })
  localDate!: string;

  @Prop({ type: String, required: true, enum: ["vegetarian_day", "expiry_alert"] })
  kind!: "vegetarian_day" | "expiry_alert";
}

export const ReminderDeliverySchema = SchemaFactory.createForClass(ReminderDelivery);
ReminderDeliverySchema.plugin(baseSchemaPlugin);
ReminderDeliverySchema.index({ userId: 1, localDate: 1 }, { unique: true });
ReminderDeliverySchema.index({ createdAt: 1 }, { expireAfterSeconds: RETENTION_SECONDS });
