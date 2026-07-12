import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";
import { baseSchemaPlugin } from "../../../common/database/base.schema";

export type HouseholdDocument = HydratedDocument<Household>;

/**
 * A household groups members who share kitchen data and a chat. Stored in a
 * global (unscoped) collection keyed by identity, not the data-scope model —
 * membership is enforced explicitly via {@link HouseholdMember}. `membersCount`
 * is a denormalized active-member count kept in step as members join/leave.
 */
@Schema({ collection: "households" })
export class Household {
  @Prop({ type: String, required: true, trim: true })
  name!: string;

  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  ownerUserId!: Types.ObjectId;

  @Prop({ type: Number, required: true, default: 1, min: 0 })
  membersCount!: number;
}

export const HouseholdSchema = SchemaFactory.createForClass(Household);
HouseholdSchema.plugin(baseSchemaPlugin);
