import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";
import type { Locale, Role } from "@kitchenpal/api-contract";
import { baseSchemaPlugin } from "../../../common/database/base.schema";

export type UserDocument = HydratedDocument<User>;

/** A linked social identity (Google/Apple) resolved from a verified id token. */
@Schema({ _id: false })
export class AuthProvider {
  @Prop({ type: String, required: true, enum: ["google", "apple"] })
  provider!: "google" | "apple";

  /** Stable provider subject id (`sub`), unique per provider. */
  @Prop({ required: true })
  providerId!: string;
}

export const AuthProviderSchema = SchemaFactory.createForClass(AuthProvider);

/**
 * Platform user account — the identity every scoped document is owned by.
 * Stored in a global (unscoped) collection: it is keyed by identity, not by the
 * data-scope model. Credentials may be absent for social/phone-only accounts.
 * `activeHouseholdId` selects the household the user is currently acting in.
 */
@Schema({ collection: "users" })
export class User {
  /** Lowercased email. Optional for phone-only accounts. Unique when present. */
  @Prop({ type: String, lowercase: true, trim: true, default: null })
  email!: string | null;

  /** bcrypt hash. Absent for accounts that only use social/phone sign-in. */
  @Prop({ type: String, default: null })
  passwordHash!: string | null;

  /** E.164-style phone. Optional; unique when present. */
  @Prop({ type: String, default: null })
  phone!: string | null;

  @Prop({ type: String, required: true, trim: true })
  displayName!: string;

  @Prop({ type: String, default: null })
  avatarUrl!: string | null;

  @Prop({ type: [String], default: ["user"] })
  roles!: Role[];

  @Prop({ type: String, required: true, default: "vi" })
  locale!: Locale;

  @Prop({ type: Date, default: null })
  emailVerifiedAt!: Date | null;

  @Prop({ type: Date, default: null })
  phoneVerifiedAt!: Date | null;

  @Prop({ type: SchemaTypes.ObjectId, default: null })
  activeHouseholdId!: Types.ObjectId | null;

  /**
   * Set by an admin to suspend the account. Suspension is enforced at sign-in
   * time — every token-minting path (password, social, phone-OTP) rejects a
   * suspended user (see AuthService.buildResult) — and admin suspension also
   * revokes all refresh families immediately. Access tokens are stateless and
   * short-lived, so an already-issued access token stays valid until it expires
   * (bounded by the access-token TTL); the auth guard does not read this field.
   */
  @Prop({ type: Date, default: null })
  suspendedAt!: Date | null;

  @Prop({ type: [AuthProviderSchema], default: [] })
  authProviders!: AuthProvider[];
}

export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.plugin(baseSchemaPlugin);

// Identity uniqueness. Partial indexes keep the constraint off null values so
// social/phone-only accounts (no email) and email-only accounts (no phone) are
// both valid without colliding on null.
UserSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: "string" } } },
);
UserSchema.index(
  { phone: 1 },
  { unique: true, partialFilterExpression: { phone: { $type: "string" } } },
);
UserSchema.index({ "authProviders.provider": 1, "authProviders.providerId": 1 });
