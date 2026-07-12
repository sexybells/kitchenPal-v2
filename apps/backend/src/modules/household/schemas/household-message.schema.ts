import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";
import type { MessageType } from "@kitchenpal/api-contract";
import { baseSchemaPlugin } from "../../../common/database/base.schema";

export type HouseholdMessageDocument = HydratedDocument<HouseholdMessage>;

/** A selectable option on a vote poll; `id` is server-assigned. */
@Schema({ _id: false })
export class VoteOption {
  @Prop({ type: String, required: true })
  id!: string;

  @Prop({ type: String, required: true })
  label!: string;
}

export const VoteOptionSchema = SchemaFactory.createForClass(VoteOption);

/** One member's ballot: which option they currently back. */
@Schema({ _id: false })
export class VoteBallot {
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  userId!: Types.ObjectId;

  @Prop({ type: String, required: true })
  optionId!: string;
}

export const VoteBallotSchema = SchemaFactory.createForClass(VoteBallot);

/** Embedded vote poll. The tally is computed from `ballots` on read. */
@Schema({ _id: false })
export class MessageVote {
  @Prop({ type: String, required: true })
  question!: string;

  @Prop({ type: [VoteOptionSchema], required: true })
  options!: VoteOption[];

  @Prop({ type: [VoteBallotSchema], default: [] })
  ballots!: VoteBallot[];
}

export const MessageVoteSchema = SchemaFactory.createForClass(MessageVote);

/**
 * A household chat message. `type` distinguishes member-authored text/image/vote
 * from system cards (`expense`/`budget_alert`) posted by the spending seam. Only
 * one payload field is populated per type. `readByUserIds` accumulates read
 * receipts. Every message belongs to exactly one household and is only ever
 * served to that household's active members.
 */
@Schema({ collection: "household_messages" })
export class HouseholdMessage {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  householdId!: Types.ObjectId;

  /** The author, or null for a server-generated card with no acting member. */
  @Prop({ type: SchemaTypes.ObjectId, default: null })
  senderId!: Types.ObjectId | null;

  @Prop({
    type: String,
    enum: ["text", "image", "vote", "expense", "budget_alert"],
    required: true,
  })
  type!: MessageType;

  @Prop({ type: String, default: null })
  text!: string | null;

  @Prop({ type: String, default: null })
  imageUrl!: string | null;

  @Prop({ type: SchemaTypes.ObjectId, default: null })
  expenseId!: Types.ObjectId | null;

  @Prop({ type: MessageVoteSchema, default: null })
  vote!: MessageVote | null;

  @Prop({ type: [SchemaTypes.ObjectId], default: [] })
  readByUserIds!: Types.ObjectId[];
}

export const HouseholdMessageSchema =
  SchemaFactory.createForClass(HouseholdMessage);
HouseholdMessageSchema.plugin(baseSchemaPlugin);
HouseholdMessageSchema.index({ householdId: 1, createdAt: -1 });
