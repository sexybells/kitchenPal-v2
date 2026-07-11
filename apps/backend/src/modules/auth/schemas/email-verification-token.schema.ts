import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";
import { baseSchemaPlugin } from "../../../common/database/base.schema";

export type EmailVerificationTokenDocument =
  HydratedDocument<EmailVerificationToken>;

/**
 * Single-use email-verification grant. Only the SHA-256 hash of the emailed
 * token is stored; it is consumed (`consumedAt`) on first success. `email`
 * pins the token to the address it was issued for.
 */
@Schema({ collection: "email_verification_tokens" })
export class EmailVerificationToken {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, lowercase: true })
  email!: string;

  @Prop({ required: true, unique: true })
  tokenHash!: string;

  @Prop({ type: Date, required: true })
  expiresAt!: Date;

  @Prop({ type: Date, default: null })
  consumedAt!: Date | null;
}

export const EmailVerificationTokenSchema = SchemaFactory.createForClass(
  EmailVerificationToken,
);
EmailVerificationTokenSchema.plugin(baseSchemaPlugin);
