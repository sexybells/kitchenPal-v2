import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { FilterQuery, HydratedDocument } from "mongoose";
import { Model } from "mongoose";
import type { ExpenseCategory } from "@kitchenpal/api-contract";
import { ScopedRepository } from "../../../common/database/base.repository";
import type { ScopedDocumentFields } from "../../../common/database/base.schema";
import { scopeFilterFor } from "../../../common/database/scope-filter";
import type { ScopeContext } from "../../../common/scope/scope-context";
import { Expense } from "../schemas/expense.schema";

export type ExpenseEntity = Expense & ScopedDocumentFields;

type ExpenseDoc = HydratedDocument<ExpenseEntity>;

/** Filters for a paginated expense listing. */
export interface ExpenseListOptions {
  category?: ExpenseCategory;
  from?: Date;
  to?: Date;
  skip: number;
  limit: number;
}

/** Range covering a set of expenses for an analytics query. */
export interface AnalyticsRange {
  from: Date;
  to: Date;
}

/** One row of the per-category rollup. */
export interface CategoryTotal {
  category: ExpenseCategory;
  total: number;
}

/** One time bucket of the spending series. */
export interface PeriodTotal {
  period: string;
  total: number;
}

/** Raw price observations for one item name, most-recent first. */
export interface PriceHistoryRow {
  name: string;
  latestPrice: number;
  minPrice: number;
  maxPrice: number;
  points: { date: Date; unitPrice: number; quantity: number }[];
}

/** Scope-partitioned store for expenses plus the spending analytics rollups. */
@Injectable()
export class ExpenseRepository extends ScopedRepository<ExpenseEntity> {
  constructor(@InjectModel(Expense.name) model: Model<ExpenseEntity>) {
    super(model);
  }

  /** One page of expenses (newest first) plus the total matching count. */
  async list(
    scope: ScopeContext,
    options: ExpenseListOptions,
  ): Promise<{ items: ExpenseDoc[]; total: number }> {
    const filter = this.buildFilter(scope, options);
    const [items, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ date: -1, _id: -1 })
        .skip(options.skip)
        .limit(options.limit)
        .exec(),
      this.model.countDocuments(filter).exec(),
    ]);
    return { items, total };
  }

  /** Total spent and expense count within a date range. */
  async totals(
    scope: ScopeContext,
    range: AnalyticsRange,
  ): Promise<{ total: number; count: number }> {
    const match = this.castMatch(this.rangeMatch(scope, range));
    const [row] = await this.model
      .aggregate<{ total: number; count: number }>([
        { $match: match },
        {
          $group: {
            _id: null,
            total: { $sum: "$totalAmount" },
            count: { $sum: 1 },
          },
        },
      ])
      .exec();
    return { total: row?.total ?? 0, count: row?.count ?? 0 };
  }

  /** Spend totals grouped by category within a date range (desc by total). */
  async totalsByCategory(
    scope: ScopeContext,
    range: AnalyticsRange,
  ): Promise<CategoryTotal[]> {
    const rows = await this.model
      .aggregate<{ _id: ExpenseCategory; total: number }>([
        { $match: this.castMatch(this.rangeMatch(scope, range)) },
        { $group: { _id: "$category", total: { $sum: "$totalAmount" } } },
        { $sort: { total: -1 } },
      ])
      .exec();
    return rows.map((row) => ({ category: row._id, total: row.total }));
  }

  /**
   * Spend totals bucketed by day or month within a date range (ascending by
   * period). Buckets are computed on the UTC calendar so results are stable
   * regardless of server timezone.
   */
  async totalsByPeriod(
    scope: ScopeContext,
    range: AnalyticsRange,
    interval: "day" | "month",
  ): Promise<PeriodTotal[]> {
    const format = interval === "day" ? "%Y-%m-%d" : "%Y-%m";
    const rows = await this.model
      .aggregate<{ _id: string; total: number }>([
        { $match: this.castMatch(this.rangeMatch(scope, range)) },
        {
          $group: {
            _id: {
              $dateToString: {
                format,
                date: "$date",
                timezone: "UTC",
              },
            },
            total: { $sum: "$totalAmount" },
          },
        },
        { $sort: { _id: 1 } },
      ])
      .exec();
    return rows.map((row) => ({ period: row._id, total: row.total }));
  }

  /**
   * Unit-price observations grouped per item name. Each item's `points` are
   * ordered most-recent first; `limit` caps distinct items when no name filter is
   * given. Ordering the outer list by most-recent observation keeps the freshest
   * trends at the top.
   */
  async priceHistory(
    scope: ScopeContext,
    options: { name?: string; limit: number },
  ): Promise<PriceHistoryRow[]> {
    const match = this.castMatch({
      ...scopeFilterFor<ExpenseEntity>(scope),
      deletedAt: null,
    } as FilterQuery<ExpenseEntity>);
    const itemMatch = options.name
      ? { "items.normalizedName": normalizeName(options.name) }
      : {};
    return this.model
      .aggregate<PriceHistoryRow>([
        { $match: match },
        { $unwind: "$items" },
        ...(options.name ? [{ $match: itemMatch }] : []),
        { $sort: { date: -1 } },
        {
          $group: {
            _id: "$items.normalizedName",
            name: { $first: "$items.name" },
            latestDate: { $first: "$date" },
            latestPrice: { $first: "$items.unitPrice" },
            minPrice: { $min: "$items.unitPrice" },
            maxPrice: { $max: "$items.unitPrice" },
            points: {
              $push: {
                date: "$date",
                unitPrice: "$items.unitPrice",
                quantity: "$items.quantity",
              },
            },
          },
        },
        { $sort: { latestDate: -1 } },
        { $limit: options.limit },
        {
          $project: {
            _id: 0,
            name: 1,
            latestPrice: 1,
            minPrice: 1,
            maxPrice: 1,
            points: 1,
          },
        },
      ])
      .exec();
  }

  private buildFilter(
    scope: ScopeContext,
    options: ExpenseListOptions,
  ): FilterQuery<ExpenseEntity> {
    const filter: FilterQuery<ExpenseEntity> = {
      ...scopeFilterFor<ExpenseEntity>(scope),
      deletedAt: null,
    };
    if (options.category) {
      filter.category = options.category;
    }
    const dateFilter = this.dateBounds(options.from, options.to);
    if (dateFilter) {
      filter.date = dateFilter;
    }
    return filter;
  }

  private rangeMatch(
    scope: ScopeContext,
    range: AnalyticsRange,
  ): FilterQuery<ExpenseEntity> {
    return {
      ...scopeFilterFor<ExpenseEntity>(scope),
      deletedAt: null,
      date: { $gte: range.from, $lt: range.to },
    } as FilterQuery<ExpenseEntity>;
  }

  /**
   * Casts a query filter (string ids → ObjectId, etc.) for use in an aggregation
   * `$match`. Unlike `find`, aggregation does not auto-cast, so the scope filter's
   * `createdBy`/`householdId` strings must be cast or they silently match nothing.
   */
  private castMatch(
    filter: FilterQuery<ExpenseEntity>,
  ): FilterQuery<ExpenseEntity> {
    return this.model.find(filter).cast(this.model) as FilterQuery<ExpenseEntity>;
  }

  private dateBounds(
    from?: Date,
    to?: Date,
  ): Record<string, Date> | undefined {
    if (!from && !to) {
      return undefined;
    }
    const bounds: Record<string, Date> = {};
    if (from) {
      bounds.$gte = from;
    }
    if (to) {
      bounds.$lt = to;
    }
    return bounds;
  }
}

/** Mirrors the service-side name normalization used when writing item names. */
function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}
