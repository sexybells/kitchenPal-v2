import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { BaseRepository } from "../../../common/database/base.repository";
import type { BaseDocumentFields } from "../../../common/database/base.schema";
import { Household } from "../schemas/household.schema";

export type HouseholdEntity = Household & BaseDocumentFields;

/** Data access for households (global collection; membership enforced in the service). */
@Injectable()
export class HouseholdRepository extends BaseRepository<HouseholdEntity> {
  constructor(@InjectModel(Household.name) model: Model<HouseholdEntity>) {
    super(model);
  }

  /** Adjusts the denormalized active-member count atomically. */
  async adjustMembersCount(id: string, delta: number): Promise<void> {
    await this.model
      .updateOne({ _id: id, deletedAt: null }, { $inc: { membersCount: delta } })
      .exec();
  }
}
