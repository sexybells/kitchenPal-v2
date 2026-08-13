import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { FilterQuery, HydratedDocument, Model } from "mongoose";
import { Types } from "mongoose";
import type { CommunityReportStatus } from "@kitchenpal/api-contract";
import { BaseRepository } from "../../../common/database/base.repository";
import type { BaseDocumentFields } from "../../../common/database/base.schema";
import { CommunityReport } from "../schemas/community-report.schema";

export type CommunityReportEntity = CommunityReport & BaseDocumentFields;

type ReportDoc = HydratedDocument<CommunityReportEntity>;

/** Store for moderation reports. The reporter is `createdBy`. */
@Injectable()
export class CommunityReportRepository extends BaseRepository<CommunityReportEntity> {
  constructor(
    @InjectModel(CommunityReport.name) model: Model<CommunityReportEntity>,
  ) {
    super(model);
  }

  /** One page of reports in a given status (newest first) plus the total. */
  async listByStatus(
    status: CommunityReportStatus,
    skip: number,
    limit: number,
  ): Promise<{ items: ReportDoc[]; total: number }> {
    const filter: FilterQuery<CommunityReportEntity> = {
      status,
      deletedAt: null,
    };
    const [items, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.model.countDocuments(filter).exec(),
    ]);
    return { items, total };
  }

  /**
   * Marks every open report against a target as `reviewed` (used when an admin
   * removes the offending post/comment). Direct status update — reports are not
   * concurrency-sensitive, so no version guard.
   */
  async markOpenReviewed(targetId: string): Promise<void> {
    await this.model
      .updateMany(
        { targetId: new Types.ObjectId(targetId), status: "open", deletedAt: null },
        { $set: { status: "reviewed" } },
      )
      .exec();
  }
}
