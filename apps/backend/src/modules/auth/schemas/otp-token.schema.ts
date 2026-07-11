import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";
import { baseSchemaPlugin } from "../../../common/database/base.schema";

export type OtpTokenDocument = HydratedDocument<OtpToken>;

/**
 * One-time verification code for a phone (or email) destination. Only the
 * SHA-256 hash of the numeric code is stored. `attempts` caps brute-force
 * guessing; `consumedAt` makes a code single-use.
 */
@Schema({ collection: "otp_tokens" })
export class OtpToken {
  @Prop({ type: String, required: true, enum: ["phone", "email"] })
  channel!: "phone" | "email";

  /** The phone number or email the code was sent to. */
  @Prop({ required: true, index: true })
  destination!: string;

  @Prop({ required: true })
  codeHash!: string;

  @Prop({ type: Date, required: true })
  expiresAt!: Date;

  @Prop({ type: Number, default: 0 })
  attempts!: number;

  @Prop({ type: Date, default: null })
  consumedAt!: Date | null;
}

export const OtpTokenSchema = SchemaFactory.createForClass(OtpToken);
OtpTokenSchema.plugin(baseSchemaPlugin);
