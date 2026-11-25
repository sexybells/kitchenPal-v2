import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { BaseRepository } from "../../../common/database/base.repository";
import type { BaseDocumentFields } from "../../../common/database/base.schema";
import { isDuplicateKeyError } from "../../../common/database/mongo-errors";
import type { ReminderKind } from "../reminder-composer";
import { ReminderDelivery } from "../schemas/reminder-delivery.schema";

export type ReminderDeliveryEntity = ReminderDelivery & BaseDocumentFields;

/** Per-user, per-local-date reminder claims. */
@Injectable()
export class ReminderDeliveryRepository extends BaseRepository<ReminderDeliveryEntity> {
  constructor(@InjectModel(ReminderDelivery.name) model: Model<ReminderDeliveryEntity>) {
    super(model);
  }

  /**
   * Claims the user's reminder slot for `localDate`. False when it was already
   * claimed (unique-index duplicate), so the caller must not send.
   */
  async claim(row: { userId: string; localDate: string; kind: ReminderKind }): Promise<boolean> {
    try {
      await this.create({
        userId: new Types.ObjectId(row.userId),
        localDate: row.localDate,
        kind: row.kind,
      });
      return true;
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        return false;
      }
      throw error;
    }
  }
}
