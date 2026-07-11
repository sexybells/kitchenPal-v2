import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";
import { baseSchemaPlugin } from "../../../common/database/base.schema";

export type RefreshTokenDocument = HydratedDocument<RefreshToken>;

/**
 * A single opaque refresh token in a rotation chain ("family"). The raw token is
 * never stored — only its SHA-256 hash — so a database leak cannot be replayed.
 *
 * Rotation + reuse-detection invariants:
 * - Every login/social/OTP sign-in starts a new `familyId`.
 * - Refreshing consumes the presented token (`rotatedAt` set) and issues a
 *   successor in the same family (`replacedByHash` links the chain).
 * - Presenting an already-consumed or revoked token is treated as theft: the
 *   entire family is revoked so neither the attacker nor the victim can proceed.
 */
@Schema({ collection: "refresh_tokens" })
export class RefreshToken {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  userId!: Types.ObjectId;

  /** Groups all tokens produced by one sign-in and its rotations. */
  @Prop({ required: true, index: true })
  familyId!: string;

  /** SHA-256 hex of the opaque token; the lookup key on refresh/logout. */
  @Prop({ required: true, unique: true })
  tokenHash!: string;

  @Prop({ type: Date, required: true })
  expiresAt!: Date;

  /** Set when this token has been rotated (consumed). Null = still live. */
  @Prop({ type: Date, default: null })
  rotatedAt!: Date | null;

  /** Hash of the successor token issued when this one was rotated. */
  @Prop({ type: String, default: null })
  replacedByHash!: string | null;

  /** Set when the token (or its whole family) has been revoked. */
  @Prop({ type: Date, default: null })
  revokedAt!: Date | null;
}

export const RefreshTokenSchema = SchemaFactory.createForClass(RefreshToken);
RefreshTokenSchema.plugin(baseSchemaPlugin);
