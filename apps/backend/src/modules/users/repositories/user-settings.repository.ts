import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { FilterQuery, HydratedDocument, Model } from "mongoose";
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

  /**
   * One page (by `_id` cursor) of personal settings whose owner may get a
   * meal-reminder push: push and meal reminders not switched off, at least one
   * push token. Cross-user by design (the reminder job), so it skips the scope
   * filter. Returns hydrated documents, never `lean()`: the `timeZone` and
   * `observesVegetarianDays` defaults exist only on hydrate and older documents
   * may lack the stored fields. For the same reason the toggles match
   * `$ne: false` and callers re-check the hydrated values.
   */
  pageReminderCandidates(
    afterId: string | null,
    limit: number,
  ): Promise<HydratedDocument<UserSettingsEntity>[]> {
    const filter: FilterQuery<UserSettingsEntity> = {
      scope: "personal",
      deletedAt: null,
      "notifications.push": { $ne: false },
      "notifications.mealReminders": { $ne: false },
      "pushTokens.0": { $exists: true },
    };
    if (afterId) {
      filter._id = { $gt: afterId };
    }
    return this.model.find(filter).sort({ _id: 1 }).limit(limit).exec();
  }
}
