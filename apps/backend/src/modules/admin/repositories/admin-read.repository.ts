import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { FilterQuery, HydratedDocument, Model } from "mongoose";
import { BaseRepository } from "../../../common/database/base.repository";
import type { BaseDocumentFields } from "../../../common/database/base.schema";
import { User } from "../../auth/schemas/user.schema";
import { Household } from "../../household/schemas/household.schema";
import { HouseholdMember } from "../../household/schemas/household-member.schema";
import { AiLog } from "../../logs/schemas/ai-log.schema";
import { ExternalSearchLog } from "../../logs/schemas/external-search-log.schema";
import { AdminAuditLog } from "../../logs/schemas/admin-audit-log.schema";
import { PantryScan } from "../../pantry/schemas/pantry-scan.schema";
import { Recipe } from "../../recipes/schemas/recipe.schema";
import { Upload } from "../../uploads/schemas/upload.schema";

/** A single page of documents plus the total matching count. */
export interface AdminPage<T extends BaseDocumentFields> {
  items: HydratedDocument<T>[];
  total: number;
}

/**
 * Cross-tenant read base for the admin console. Uses the UNSCOPED
 * {@link BaseRepository} so admins can list every tenant's data, while the
 * soft-delete exclusion still applies. Reads are always paginated and bounded.
 */
export abstract class AdminReadRepository<
  T extends BaseDocumentFields,
> extends BaseRepository<T> {
  async paginate(
    filter: FilterQuery<T>,
    sort: Record<string, 1 | -1>,
    skip: number,
    limit: number,
  ): Promise<AdminPage<T>> {
    const scoped = this.notDeletedFilter(filter);
    const [items, total] = await Promise.all([
      this.model.find(scoped).sort(sort).skip(skip).limit(limit).exec(),
      this.model.countDocuments(scoped).exec(),
    ]);
    return { items, total };
  }

  /**
   * Counts documents created per UTC time bucket in `[from, to]`. `dateFormat`
   * is a `$dateToString` format (e.g. `%Y-%m-%d` for daily). Used by the growth
   * report; soft-deleted rows are excluded.
   */
  async countCreatedByBucket(
    from: Date,
    to: Date,
    dateFormat: string,
  ): Promise<{ date: string; count: number }[]> {
    return this.model.aggregate<{ date: string; count: number }>([
      {
        $match: this.notDeletedFilter({
          createdAt: { $gte: from, $lte: to },
        } as FilterQuery<T>),
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: dateFormat,
              date: "$createdAt",
              timezone: "UTC",
            },
          },
          count: { $sum: 1 },
        },
      },
      { $project: { _id: 0, date: "$_id", count: 1 } },
      { $sort: { date: 1 } },
    ]);
  }
}

type UserEntity = User & BaseDocumentFields;
type HouseholdEntity = Household & BaseDocumentFields;
type HouseholdMemberEntity = HouseholdMember & BaseDocumentFields;
type RecipeEntity = Recipe & BaseDocumentFields;
type PantryScanEntity = PantryScan & BaseDocumentFields;
type UploadEntity = Upload & BaseDocumentFields;
type AiLogEntity = AiLog & BaseDocumentFields;
type ExternalSearchLogEntity = ExternalSearchLog & BaseDocumentFields;
type AdminAuditLogEntity = AdminAuditLog & BaseDocumentFields;

@Injectable()
export class AdminUserReadRepository extends AdminReadRepository<UserEntity> {
  constructor(@InjectModel(User.name) model: Model<UserEntity>) {
    super(model);
  }
}

@Injectable()
export class AdminHouseholdReadRepository extends AdminReadRepository<HouseholdEntity> {
  constructor(@InjectModel(Household.name) model: Model<HouseholdEntity>) {
    super(model);
  }
}

@Injectable()
export class AdminHouseholdMemberReadRepository extends AdminReadRepository<HouseholdMemberEntity> {
  constructor(
    @InjectModel(HouseholdMember.name) model: Model<HouseholdMemberEntity>,
  ) {
    super(model);
  }

  countForHousehold(householdId: string): Promise<number> {
    return this.count({ householdId, status: "active" } as FilterQuery<HouseholdMemberEntity>);
  }
}

@Injectable()
export class AdminRecipeRepository extends AdminReadRepository<RecipeEntity> {
  constructor(@InjectModel(Recipe.name) model: Model<RecipeEntity>) {
    super(model);
  }
}

@Injectable()
export class AdminScanReadRepository extends AdminReadRepository<PantryScanEntity> {
  constructor(@InjectModel(PantryScan.name) model: Model<PantryScanEntity>) {
    super(model);
  }
}

@Injectable()
export class AdminUploadReadRepository extends AdminReadRepository<UploadEntity> {
  constructor(@InjectModel(Upload.name) model: Model<UploadEntity>) {
    super(model);
  }
}

@Injectable()
export class AdminAiLogReadRepository extends AdminReadRepository<AiLogEntity> {
  constructor(@InjectModel(AiLog.name) model: Model<AiLogEntity>) {
    super(model);
  }

  /** AI calls and failures per UTC time bucket (ai-trend report). */
  aggregateTrend(
    from: Date,
    to: Date,
    dateFormat: string,
  ): Promise<{ date: string; calls: number; failures: number }[]> {
    return this.model.aggregate<{
      date: string;
      calls: number;
      failures: number;
    }>([
      {
        $match: this.notDeletedFilter({
          createdAt: { $gte: from, $lte: to },
        } as FilterQuery<AiLogEntity>),
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: dateFormat,
              date: "$createdAt",
              timezone: "UTC",
            },
          },
          calls: { $sum: 1 },
          failures: {
            $sum: { $cond: [{ $eq: ["$success", false] }, 1, 0] },
          },
        },
      },
      { $project: { _id: 0, date: "$_id", calls: 1, failures: 1 } },
      { $sort: { date: 1 } },
    ]);
  }

  /** Token and USD cost totals grouped by provider (ai-costs report). */
  aggregateCostByProvider(
    from: Date,
    to: Date,
  ): Promise<
    {
      provider: string;
      calls: number;
      promptTokens: number;
      completionTokens: number;
      costUsd: number;
    }[]
  > {
    return this.model.aggregate<{
      provider: string;
      calls: number;
      promptTokens: number;
      completionTokens: number;
      costUsd: number;
    }>([
      {
        $match: this.notDeletedFilter({
          createdAt: { $gte: from, $lte: to },
        } as FilterQuery<AiLogEntity>),
      },
      {
        $group: {
          _id: "$provider",
          calls: { $sum: 1 },
          promptTokens: { $sum: { $ifNull: ["$promptTokens", 0] } },
          completionTokens: { $sum: { $ifNull: ["$completionTokens", 0] } },
          costUsd: { $sum: { $ifNull: ["$costUsd", 0] } },
        },
      },
      {
        $project: {
          _id: 0,
          provider: "$_id",
          calls: 1,
          promptTokens: 1,
          completionTokens: 1,
          costUsd: 1,
        },
      },
      { $sort: { provider: 1 } },
    ]);
  }
}

@Injectable()
export class AdminExternalSearchLogReadRepository extends AdminReadRepository<ExternalSearchLogEntity> {
  constructor(
    @InjectModel(ExternalSearchLog.name) model: Model<ExternalSearchLogEntity>,
  ) {
    super(model);
  }
}

@Injectable()
export class AdminAuditLogReadRepository extends AdminReadRepository<AdminAuditLogEntity> {
  constructor(@InjectModel(AdminAuditLog.name) model: Model<AdminAuditLogEntity>) {
    super(model);
  }
}
