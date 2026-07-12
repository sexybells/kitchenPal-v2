import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { HydratedDocument, Model } from "mongoose";
import { BaseRepository } from "../../../common/database/base.repository";
import type { BaseDocumentFields } from "../../../common/database/base.schema";
import { UserSubscription } from "../schemas/user-subscription.schema";

export type UserSubscriptionEntity = UserSubscription & BaseDocumentFields;

/** Data access for per-user subscriptions (assigned by admins in v1). */
@Injectable()
export class UserSubscriptionRepository extends BaseRepository<UserSubscriptionEntity> {
  constructor(
    @InjectModel(UserSubscription.name) model: Model<UserSubscriptionEntity>,
  ) {
    super(model);
  }

  /** The user's current active subscription, if any. */
  findActiveForUser(
    userId: string,
  ): Promise<HydratedDocument<UserSubscriptionEntity> | null> {
    return this.model
      .findOne(this.notDeletedFilter({ userId, status: "active" }))
      .sort({ startAt: -1 })
      .exec();
  }

  /** Counts distinct users with an active subscription (usage reports). */
  countActive(): Promise<number> {
    return this.count({ status: "active" });
  }
}
