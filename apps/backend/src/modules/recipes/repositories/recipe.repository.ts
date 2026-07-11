import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { FilterQuery, HydratedDocument } from "mongoose";
import { Model } from "mongoose";
import type { MealType } from "@kitchenpal/api-contract";
import { ScopedRepository } from "../../../common/database/base.repository";
import type { ScopedDocumentFields } from "../../../common/database/base.schema";
import { scopeFilterFor } from "../../../common/database/scope-filter";
import type { ScopeContext } from "../../../common/scope/scope-context";
import { Recipe } from "../schemas/recipe.schema";

export type RecipeEntity = Recipe & ScopedDocumentFields;

/** Filters and sort for the caller's own recipe listing. */
export interface OwnRecipeListOptions {
  mealType?: MealType;
  tag?: string;
  search?: string;
  sort: "recent" | "name" | "rating";
  skip: number;
  limit: number;
}

/** Filters and sort for the public community feed. */
export interface CommunityListOptions {
  mealType?: MealType;
  tag?: string;
  search?: string;
  sort: "rating" | "popular" | "recent";
  skip: number;
  limit: number;
}

const OWN_SORT: Record<OwnRecipeListOptions["sort"], Record<string, 1 | -1>> = {
  recent: { createdAt: -1 },
  name: { normalizedName: 1 },
  rating: { averageRating: -1, reviewCount: -1 },
};

const COMMUNITY_SORT: Record<
  CommunityListOptions["sort"],
  Record<string, 1 | -1>
> = {
  rating: { averageRating: -1, reviewCount: -1, createdAt: -1 },
  popular: { viewCount: -1, averageRating: -1 },
  recent: { createdAt: -1 },
};

type RecipeDoc = HydratedDocument<RecipeEntity>;

/**
 * Scope-partitioned store for recipes. Owner mutations run through the inherited
 * scoped methods (a caller can only edit/delete their own). Reads that must span
 * scopes — the community feed, system seed content, and resolving a recipe the
 * caller can *see* — go through explicit, safe read paths built here from a
 * "readable" filter rather than by disabling the scope filter globally.
 */
@Injectable()
export class RecipeRepository extends ScopedRepository<RecipeEntity> {
  constructor(@InjectModel(Recipe.name) model: Model<RecipeEntity>) {
    super(model);
  }

  /**
   * The visibility rule as a Mongo filter fragment: a recipe is readable when it
   * is the caller's own (scope-owned), server-owned (`system`), or a published
   * community recipe. Always paired with the soft-delete exclusion.
   */
  private readableFilter(scope: ScopeContext): FilterQuery<RecipeEntity> {
    return {
      deletedAt: null,
      $or: [
        scopeFilterFor<RecipeEntity>(scope),
        { scope: "system" },
        { published: true },
      ],
    } as FilterQuery<RecipeEntity>;
  }

  /** Fetches a recipe the caller may read (own, system, or published). */
  findReadableById(
    scope: ScopeContext,
    id: string,
  ): Promise<RecipeDoc | null> {
    return this.model
      .findOne({ ...this.readableFilter(scope), _id: id })
      .exec();
  }

  /**
   * Increments a recipe's view counter. A monotonic derived counter, so it is
   * updated directly without the version guard (a view is not a concurrency-
   * sensitive mutation and must not force readers to retry).
   */
  async incrementView(id: string): Promise<void> {
    await this.model
      .updateOne({ _id: id, deletedAt: null }, { $inc: { viewCount: 1 } })
      .exec();
  }

  /**
   * Writes the recomputed rating aggregate onto a recipe. Derived from all
   * users' comments, so it crosses the comment author's scope and is applied
   * directly (no version guard) — the recipe owner did not initiate this write.
   */
  async applyRatingStats(
    id: string,
    stats: { averageRating: number; reviewCount: number },
  ): Promise<void> {
    await this.model
      .updateOne(
        { _id: id, deletedAt: null },
        {
          $set: {
            averageRating: stats.averageRating,
            reviewCount: stats.reviewCount,
          },
        },
      )
      .exec();
  }

  /** Resolves many readable recipes by id (favorites, meal-plan slot summaries). */
  findReadableByIds(scope: ScopeContext, ids: string[]): Promise<RecipeDoc[]> {
    if (ids.length === 0) {
      return Promise.resolve([]);
    }
    return this.model
      .find({ ...this.readableFilter(scope), _id: { $in: ids } })
      .exec();
  }

  /**
   * Candidate recipes for suggestions/auto-fill: everything the caller can read,
   * optionally narrowed to a meal type. Capped so ranking stays cheap.
   */
  findCandidates(
    scope: ScopeContext,
    options: { mealType?: MealType; limit?: number } = {},
  ): Promise<RecipeDoc[]> {
    const filter: FilterQuery<RecipeEntity> = this.readableFilter(scope);
    if (options.mealType) {
      filter.mealType = options.mealType;
    }
    return this.model
      .find(filter)
      .sort({ averageRating: -1, viewCount: -1, createdAt: -1 })
      .limit(options.limit ?? 200)
      .exec();
  }

  /** One page of the caller's own recipes. */
  async listOwn(
    scope: ScopeContext,
    options: OwnRecipeListOptions,
  ): Promise<{ items: RecipeDoc[]; total: number }> {
    const filter = this.buildScopedListFilter(scope, options);
    return this.page(filter, OWN_SORT[options.sort], options.skip, options.limit);
  }

  /** One page of the public community feed (published recipes, any owner). */
  async listCommunity(
    options: CommunityListOptions,
  ): Promise<{ items: RecipeDoc[]; total: number }> {
    const filter: FilterQuery<RecipeEntity> = {
      deletedAt: null,
      published: true,
    };
    this.applyContentFilters(filter, options);
    return this.page(
      filter,
      COMMUNITY_SORT[options.sort],
      options.skip,
      options.limit,
    );
  }

  private buildScopedListFilter(
    scope: ScopeContext,
    options: OwnRecipeListOptions,
  ): FilterQuery<RecipeEntity> {
    const filter: FilterQuery<RecipeEntity> = {
      ...scopeFilterFor<RecipeEntity>(scope),
      deletedAt: null,
    };
    this.applyContentFilters(filter, options);
    return filter;
  }

  private applyContentFilters(
    filter: FilterQuery<RecipeEntity>,
    options: { mealType?: MealType; tag?: string; search?: string },
  ): void {
    if (options.mealType) {
      filter.mealType = options.mealType;
    }
    if (options.tag) {
      filter.tags = options.tag;
    }
    if (options.search) {
      filter.name = { $regex: escapeRegExp(options.search), $options: "i" };
    }
  }

  private async page(
    filter: FilterQuery<RecipeEntity>,
    sort: Record<string, 1 | -1>,
    skip: number,
    limit: number,
  ): Promise<{ items: RecipeDoc[]; total: number }> {
    const [items, total] = await Promise.all([
      this.model.find(filter).sort(sort).skip(skip).limit(limit).exec(),
      this.model.countDocuments(filter).exec(),
    ]);
    return { items, total };
  }
}

/** Escapes user input before embedding it in a Mongo `$regex`. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
