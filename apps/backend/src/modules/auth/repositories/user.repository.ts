import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { HydratedDocument, Model } from "mongoose";
import { BaseRepository } from "../../../common/database/base.repository";
import type { BaseDocumentFields } from "../../../common/database/base.schema";
import { User } from "../schemas/user.schema";

/** The persisted shape: the schema class plus the base platform fields. */
export type UserEntity = User & BaseDocumentFields;

/**
 * Data access for the global user collection. Lookups are by identity
 * (email/phone/social subject); all identity comparisons are normalized so a
 * caller cannot register the same email under different casing.
 */
@Injectable()
export class UserRepository extends BaseRepository<UserEntity> {
  constructor(@InjectModel(User.name) model: Model<UserEntity>) {
    super(model);
  }

  findByEmail(email: string): Promise<HydratedDocument<UserEntity> | null> {
    return this.findOne({ email: email.trim().toLowerCase() });
  }

  findByPhone(phone: string): Promise<HydratedDocument<UserEntity> | null> {
    return this.findOne({ phone });
  }

  findByProvider(
    provider: "google" | "apple",
    providerId: string,
  ): Promise<HydratedDocument<UserEntity> | null> {
    return this.findOne({
      authProviders: { $elemMatch: { provider, providerId } },
    });
  }
}
