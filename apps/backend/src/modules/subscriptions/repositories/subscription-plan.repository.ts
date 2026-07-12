import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { HydratedDocument, Model } from "mongoose";
import { BaseRepository } from "../../../common/database/base.repository";
import type { BaseDocumentFields } from "../../../common/database/base.schema";
import { SubscriptionPlan } from "../schemas/subscription-plan.schema";

export type SubscriptionPlanEntity = SubscriptionPlan & BaseDocumentFields;

/** Data access for subscription plans (global reference data). */
@Injectable()
export class SubscriptionPlanRepository extends BaseRepository<SubscriptionPlanEntity> {
  constructor(
    @InjectModel(SubscriptionPlan.name) model: Model<SubscriptionPlanEntity>,
  ) {
    super(model);
  }

  /** Active plans in a stable order for the public plan list. */
  listActive(): Promise<HydratedDocument<SubscriptionPlanEntity>[]> {
    return this.model
      .find(this.notDeletedFilter({ active: true }))
      .sort({ priceVnd: 1, createdAt: 1 })
      .exec();
  }

  /** All plans (admin view), newest first. */
  listAll(): Promise<HydratedDocument<SubscriptionPlanEntity>[]> {
    return this.model
      .find(this.notDeletedFilter())
      .sort({ createdAt: -1 })
      .exec();
  }

  /** Hard-deletes every plan. Used only by the non-production dev-reset tool. */
  async hardDeleteAll(): Promise<number> {
    const result = await this.model.deleteMany({}).exec();
    return result.deletedCount ?? 0;
  }
}
