import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { BaseRepository } from "../../../common/database/base.repository";
import type { BaseDocumentFields } from "../../../common/database/base.schema";
import { AiLog } from "../schemas/ai-log.schema";

export type AiLogEntity = AiLog & BaseDocumentFields;

/**
 * Unscoped audit store for AI provider calls (vision, suggestions, meal
 * auto-fill). Global by design — cost and reliability tracking spans all users —
 * so it uses the unscoped {@link BaseRepository}. Callers must never write image
 * bytes or provider keys into log entries.
 */
@Injectable()
export class AiLogRepository extends BaseRepository<AiLogEntity> {
  constructor(@InjectModel(AiLog.name) model: Model<AiLogEntity>) {
    super(model);
  }
}
