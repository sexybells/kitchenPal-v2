import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { BaseRepository } from "../../../common/database/base.repository";
import type { BaseDocumentFields } from "../../../common/database/base.schema";
import { ExternalSearchLog } from "../schemas/external-search-log.schema";

export type ExternalSearchLogEntity = ExternalSearchLog & BaseDocumentFields;

/**
 * Unscoped audit store for external web-search and URL-scrape calls. Global by
 * design (reliability/cost tracking spans all users), so it uses the unscoped
 * {@link BaseRepository}. Callers must never write secrets or full page bodies.
 */
@Injectable()
export class ExternalSearchLogRepository extends BaseRepository<ExternalSearchLogEntity> {
  constructor(
    @InjectModel(ExternalSearchLog.name) model: Model<ExternalSearchLogEntity>,
  ) {
    super(model);
  }
}
