import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";
import type { NotificationType } from "@kitchenpal/api-contract";
import { baseSchemaPlugin } from "../../../common/database/base.schema";

export type NotificationDocument = HydratedDocument<Notification>;

/**
 * An in-app notification addressed to a single user. Global collection keyed by
 * `userId` (a notification is personal to its recipient, independent of any
 * household scope). `payload` is a free-form object carrying the deep-link
 * context the client renders and navigates on. `readAt` is null until read.
 */
@Schema({ collection: "notifications" })
export class Notification {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({
    type: String,
    enum: [
      "expiry_alert",
      "budget_alert",
      "chat_message",
      "chat_mention",
      "household_invite",
      "invite_accepted",
    ],
    required: true,
  })
  type!: NotificationType;

  @Prop({ type: SchemaTypes.Mixed, default: {} })
  payload!: Record<string, unknown>;

  @Prop({ type: Date, default: null, index: true })
  readAt!: Date | null;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);
NotificationSchema.plugin(baseSchemaPlugin);
NotificationSchema.index({ userId: 1, createdAt: -1 });
