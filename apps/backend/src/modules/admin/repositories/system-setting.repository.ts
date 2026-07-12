import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { HydratedDocument, Model } from "mongoose";
import { BaseRepository } from "../../../common/database/base.repository";
import type { BaseDocumentFields } from "../../../common/database/base.schema";
import { SystemSetting } from "../schemas/system-setting.schema";

export type SystemSettingEntity = SystemSetting & BaseDocumentFields;

/** Data access for integration settings, keyed by a stable setting `key`. */
@Injectable()
export class SystemSettingRepository extends BaseRepository<SystemSettingEntity> {
  constructor(@InjectModel(SystemSetting.name) model: Model<SystemSettingEntity>) {
    super(model);
  }

  findByKey(
    key: string,
  ): Promise<HydratedDocument<SystemSettingEntity> | null> {
    return this.findOne({ key });
  }

  listAll(): Promise<HydratedDocument<SystemSettingEntity>[]> {
    return this.model
      .find(this.notDeletedFilter())
      .sort({ key: 1 })
      .exec();
  }

  /**
   * Creates or updates a setting by key in one step (settings are singletons per
   * key), stamping the actor. Never stores secrets — the service sanitizes the
   * config before calling this.
   */
  async upsert(
    key: string,
    enabled: boolean,
    config: Record<string, unknown>,
    actorId: string,
  ): Promise<HydratedDocument<SystemSettingEntity>> {
    // `key` is fixed by the filter equality, so it must NOT also appear in
    // `$setOnInsert` (Mongo rejects a path set by both). On insert the filter
    // value is applied automatically.
    const updated = await this.model
      .findOneAndUpdate(
        this.notDeletedFilter({ key }),
        {
          $set: { enabled, config, updatedBy: actorId },
          $inc: { version: 1 },
          $setOnInsert: { createdBy: actorId, deletedAt: null },
        },
        { new: true, upsert: true },
      )
      .exec();
    return updated;
  }
}
