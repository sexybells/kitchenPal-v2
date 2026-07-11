import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { ScopedRepository } from "../../../common/database/base.repository";
import type { ScopedDocumentFields } from "../../../common/database/base.schema";
import { UserSettings } from "../schemas/user-settings.schema";

export type UserSettingsEntity = UserSettings & ScopedDocumentFields;

/**
 * Personal-scoped store for a user's settings. Exactly one document exists per
 * user (owned via `createdBy`); the scope filter guarantees a caller only ever
 * reads or writes their own settings.
 */
@Injectable()
export class UserSettingsRepository extends ScopedRepository<UserSettingsEntity> {
  constructor(@InjectModel(UserSettings.name) model: Model<UserSettingsEntity>) {
    super(model);
  }
}
