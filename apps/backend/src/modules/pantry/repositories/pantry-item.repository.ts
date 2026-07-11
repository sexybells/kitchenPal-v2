import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { ClientSession, FilterQuery, HydratedDocument } from "mongoose";
import { Model } from "mongoose";
import type { StockState } from "@kitchenpal/api-contract";
import { ScopedRepository } from "../../../common/database/base.repository";
import type { ScopedDocumentFields } from "../../../common/database/base.schema";
import { scopeFilterFor } from "../../../common/database/scope-filter";
import type { ScopeContext } from "../../../common/scope/scope-context";
import { PantryItem } from "../schemas/pantry-item.schema";

export type PantryItemEntity = PantryItem & ScopedDocumentFields;

/** Filters and sort for a paginated pantry listing. */
export interface PantryListOptions {
  category?: string;
  stockState?: StockState;
  search?: string;
  expiringBefore?: Date;
  sort: "expiry" | "name" | "recent";
  skip: number;
  limit: number;
}

/**
 * The furthest representable date. Items without an expiry are treated as
 * expiring at this instant so they sort AFTER every real expiry in the
 * soonest-first `expiry` view (Mongo would otherwise place nulls first).
 */
const FAR_FUTURE = new Date(8_640_000_000_000_000);

const SORT_SPEC: Record<
  PantryListOptions["sort"],
  Record<string, 1 | -1>
> = {
  // Soonest-expiring first; no-expiry items last (see `_expirySort` below).
  expiry: { _expirySort: 1, name: 1 },
  name: { name: 1 },
  recent: { createdAt: -1 },
};

/**
 * Scope-partitioned store for pantry items. Adds a paginated, filtered listing
 * on top of the shared scoped repository; every query still runs through the
 * scope filter so a caller only ever sees their own (or their household's) items.
 */
@Injectable()
export class PantryItemRepository extends ScopedRepository<PantryItemEntity> {
  constructor(@InjectModel(PantryItem.name) model: Model<PantryItemEntity>) {
    super(model);
  }

  /** Case-insensitive name lookup within scope; used to resolve cook ingredients. */
  findByName(
    scope: ScopeContext,
    name: string,
    session?: ClientSession,
  ): Promise<HydratedDocument<PantryItemEntity> | null> {
    return this.findOne(
      scope,
      {
        name: { $regex: `^${escapeRegExp(name)}$`, $options: "i" },
      } as FilterQuery<PantryItemEntity>,
      session,
    );
  }

  /**
   * Returns one page of items plus the total matching count. Uses an aggregation
   * so the `expiry` view can order by a computed key that pushes no-expiry items
   * last; results are hydrated back into full documents for the caller.
   */
  async list(
    scope: ScopeContext,
    options: PantryListOptions,
  ): Promise<{ items: HydratedDocument<PantryItemEntity>[]; total: number }> {
    const filter = this.buildListFilter(scope, options);
    // Aggregation does not auto-cast query values the way `find` does, so cast
    // the filter (string ids → ObjectId, etc.) before using it in `$match`.
    const matchFilter = this.model.find(filter).cast(this.model);
    const [raw, total] = await Promise.all([
      this.model
        .aggregate<Record<string, unknown>>([
          { $match: matchFilter },
          { $addFields: { _expirySort: { $ifNull: ["$expiryDate", FAR_FUTURE] } } },
          { $sort: SORT_SPEC[options.sort] },
          { $skip: options.skip },
          { $limit: options.limit },
          { $unset: "_expirySort" },
        ])
        .exec(),
      this.model.countDocuments(filter).exec(),
    ]);
    return { items: raw.map((doc) => this.model.hydrate(doc)), total };
  }

  private buildListFilter(
    scope: ScopeContext,
    options: PantryListOptions,
  ): FilterQuery<PantryItemEntity> {
    const filter: FilterQuery<PantryItemEntity> = {
      ...scopeFilterFor<PantryItemEntity>(scope),
      deletedAt: null,
    };
    if (options.category) {
      filter.category = options.category;
    }
    if (options.stockState) {
      filter.stockState = options.stockState;
    }
    if (options.search) {
      filter.name = { $regex: escapeRegExp(options.search), $options: "i" };
    }
    if (options.expiringBefore) {
      // Only items with a tracked expiry that falls before the cutoff.
      filter.expiryDate = { $ne: null, $lte: options.expiringBefore };
    }
    return filter;
  }
}

/** Escapes user input before embedding it in a Mongo `$regex`. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
