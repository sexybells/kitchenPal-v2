import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";
import { baseSchemaPlugin } from "../../../common/database/base.schema";

export type PasswordResetTokenDocument = HydratedDocument<PasswordResetToken>;

/**
 * Single-use password-reset grant. Only the SHA-256 hash of the emailed token is
 * stored; it is consumed (`consumedAt`) the first time it succeeds so a token
 * cannot be replayed.
 */
@Schema({ collection: "password_reset_tokens" })
export class PasswordResetToken {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, unique: true })
  tokenHash!: string;

  @Prop({ type: Date, required: true })
  expiresAt!: Date;

  @Prop({ type: Date, default: null })
  consumedAt!: Date | null;
}

export const PasswordResetTokenSchema =
  SchemaFactory.createForClass(PasswordResetToken);
PasswordResetTokenSchema.plugin(baseSchemaPlugin);
