import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";
import type { HouseholdRole, MemberStatus } from "@kitchenpal/api-contract";
import { baseSchemaPlugin } from "../../../common/database/base.schema";

export type HouseholdMemberDocument = HydratedDocument<HouseholdMember>;

/**
 * A membership edge between a user and a household. The (householdId, userId)
 * pair is unique, so a `removed` tombstone is kept rather than deleted — a later
 * re-invite reactivates the same row instead of colliding. `active` is the only
 * status that grants access; the scope guard and every household route check it.
 */
@Schema({ collection: "household_members" })
export class HouseholdMember {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  householdId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({
    type: String,
    enum: ["owner", "admin", "member"],
    required: true,
    default: "member",
  })
  role!: HouseholdRole;

  @Prop({
    type: String,
    enum: ["active", "invited", "removed"],
    required: true,
    default: "active",
    index: true,
  })
  status!: MemberStatus;
}

export const HouseholdMemberSchema =
  SchemaFactory.createForClass(HouseholdMember);
HouseholdMemberSchema.plugin(baseSchemaPlugin);
HouseholdMemberSchema.index({ householdId: 1, userId: 1 }, { unique: true });
