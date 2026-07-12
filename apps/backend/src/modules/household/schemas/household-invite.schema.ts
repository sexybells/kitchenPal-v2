import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";
import { baseSchemaPlugin } from "../../../common/database/base.schema";

export type HouseholdInviteDocument = HydratedDocument<HouseholdInvite>;

export type InviteStatus = "pending" | "accepted" | "revoked";

/**
 * A single-use join code for a household. The `code` is a high-entropy opaque
 * string (unguessable) and unique; accepting it is the ONLY way to join a
 * household. Expiry is enforced at accept time against `expiresAt`, and the
 * status moves `pending → accepted | revoked` so a code cannot be reused.
 */
@Schema({ collection: "household_invites" })
export class HouseholdInvite {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  householdId!: Types.ObjectId;

  @Prop({ type: String, required: true, unique: true })
  code!: string;

  @Prop({
    type: String,
    enum: ["pending", "accepted", "revoked"],
    required: true,
    default: "pending",
    index: true,
  })
  status!: InviteStatus;

  @Prop({ type: Date, required: true })
  expiresAt!: Date;

  @Prop({ type: SchemaTypes.ObjectId, required: true })
  invitedBy!: Types.ObjectId;

  /** Set when the invite is accepted, for audit. */
  @Prop({ type: SchemaTypes.ObjectId, default: null })
  acceptedBy!: Types.ObjectId | null;
}

export const HouseholdInviteSchema =
  SchemaFactory.createForClass(HouseholdInvite);
HouseholdInviteSchema.plugin(baseSchemaPlugin);
