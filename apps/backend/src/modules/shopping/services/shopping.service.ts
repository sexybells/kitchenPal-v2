import { randomUUID } from "node:crypto";
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  AddNeededItemsInput,
  AddShoppingItemInput,
  GenerateShoppingInput,
  ShoppingItem as ShoppingItemContract,
  ShoppingListResponse,
  UpdateShoppingItemInput,
} from "@kitchenpal/api-contract";
import type { HydratedDocument } from "mongoose";
import { isDuplicateKeyError } from "../../../common/database/mongo-errors";
import { ErrorCode } from "../../../common/http/error-codes";
import type { ScopeContext } from "../../../common/scope/scope-context";
import { PantryItemRepository } from "../../pantry/repositories/pantry-item.repository";
import { MealPlanRepository } from "../../recipes/repositories/meal-plan.repository";
import { RecipeRepository } from "../../recipes/repositories/recipe.repository";
import { matchIngredients } from "../../recipes/services/pantry-match";
import {
  ShoppingListRepository,
  type ShoppingListEntity,
} from "../repositories/shopping-list.repository";
import { ShoppingItem } from "../schemas/shopping-list.schema";
import {
  mergeNeededIntoItems,
  type MergeableItem,
  type NeededItem,
} from "./shopping-item-merge";

type ShoppingListDoc = HydratedDocument<ShoppingListEntity>;

/**
 * How many times a convergent merge re-reads and retries after losing the
 * optimistic-lock race. Merging is idempotent, so a bounded retry lets automated
 * hand-offs (pantry refill / recipe add-missing) converge instead of dropping
 * items on a concurrent list edit.
 */
const MAX_MERGE_ATTEMPTS = 5;

/**
 * Shopping-list lifecycle: generate from a meal plan (recipe ingredients minus
 * pantry stock), read the current list, and version-guarded item CRUD including
 * the `bought` toggle. All access is scope-partitioned. The `version` guard makes
 * every item mutation atomic so two shoppers on a shared list cannot lose each
 * other's writes.
 */
@Injectable()
export class ShoppingService {
  constructor(
    private readonly lists: ShoppingListRepository,
    private readonly plans: MealPlanRepository,
    private readonly recipes: RecipeRepository,
    private readonly pantry: PantryItemRepository,
  ) {}

  /**
   * Builds (or refreshes) the shopping list for a meal plan. For every planned
   * recipe it classifies ingredients against the pantry, keeps only the needed
   * ones, dedupes across recipes, and merges the result into the plan's single
   * live list. Re-running is idempotent — existing lines (and their `bought`
   * state) are preserved, never duplicated.
   */
  async generate(
    scope: ScopeContext,
    input: GenerateShoppingInput,
  ): Promise<ShoppingListResponse> {
    const plan = await this.plans.findById(scope, input.mealPlanId);
    if (!plan) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: "Meal plan not found",
        details: { id: input.mealPlanId },
      });
    }

    const recipeIds = unique(
      plan.slots
        .map((slot) => slot.recipeId?.toString())
        .filter((value): value is string => Boolean(value)),
    );
    const recipes = await this.recipes.findReadableByIds(scope, recipeIds);
    const pantryItems = await this.pantry.find(scope);
    const stock = pantryItems.map((item) => ({
      id: item.id,
      name: item.name,
      stockState: item.stockState,
      expiryDate: item.expiryDate ?? null,
    }));

    const needed: NeededItem[] = [];
    for (const recipe of recipes) {
      const match = matchIngredients(recipe.ingredients, stock);
      for (const entry of match.needed) {
        needed.push({
          name: entry.ingredient.name,
          quantity: entry.ingredient.quantity,
          unit: entry.ingredient.unit,
          category: null,
          sourceRecipeId: recipe.id,
        });
      }
    }

    const existing = await this.lists.findByMealPlanId(scope, input.mealPlanId);
    if (existing) {
      return this.mergeConverge(
        scope,
        needed,
        () => this.lists.findByMealPlanId(scope, input.mealPlanId),
        null,
      );
    }
    return this.createForPlan(scope, input.mealPlanId, needed);
  }

  async getCurrent(scope: ScopeContext): Promise<ShoppingListResponse> {
    const current = await this.lists.findCurrent(scope);
    if (!current) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: "No shopping list found",
      });
    }
    return toResponse(current);
  }

  async getById(scope: ScopeContext, id: string): Promise<ShoppingListResponse> {
    return toResponse(await this.requireList(scope, id));
  }

  /**
   * Merges ad-hoc needed items (the pantry-refill / recipe add-missing hand-off)
   * into the caller's current list, creating an ad-hoc list when none exists.
   * Merging by name + unit keeps a replayed hand-off from duplicating lines. This
   * is an AUTOMATED seam (no client `expectedVersion`), so a concurrent list edit
   * is absorbed by re-reading and retrying rather than surfaced as a 409 that
   * would silently drop the items.
   */
  async addNeededItems(
    scope: ScopeContext,
    input: AddNeededItemsInput,
  ): Promise<ShoppingListResponse> {
    const needed: NeededItem[] = input.items.map((item) => ({
      name: item.name,
      quantity: item.quantity ?? null,
      unit: item.unit ?? null,
      category: item.category ?? null,
      sourceRecipeId: item.sourceRecipeId ?? null,
    }));

    return this.mergeConverge(
      scope,
      needed,
      () => this.lists.findCurrent(scope),
      async () => {
        const items = mergeNeededIntoItems([], needed);
        return this.lists.create(scope, {
          mealPlanId: null,
          items: items as unknown as ShoppingItem[],
        } as Partial<ShoppingListEntity>);
      },
    );
  }

  /** Appends one item to a list; version-guarded so a stale write is a 409. */
  async addItem(
    scope: ScopeContext,
    id: string,
    input: AddShoppingItemInput,
  ): Promise<ShoppingListResponse> {
    const list = await this.requireList(scope, id);
    const nextItems: MergeableItem[] = [
      ...list.items.map(toMergeable),
      {
        id: randomUUID(),
        name: input.name,
        quantity: input.quantity ?? null,
        unit: input.unit ?? null,
        category: input.category ?? null,
        bought: false,
        sourceRecipeId: input.sourceRecipeId ?? null,
      },
    ];
    const updated = await this.lists.updateWithVersion(
      scope,
      list.id,
      input.expectedVersion,
      { items: nextItems as unknown as ShoppingItem[] },
    );
    return toResponse(updated);
  }

  /**
   * Edits an item or toggles its `bought` flag. `expectedVersion` makes the write
   * atomic: a concurrent edit that already bumped the version loses the race with
   * a 409 rather than silently clobbering the other shopper's change.
   */
  async updateItem(
    scope: ScopeContext,
    id: string,
    itemId: string,
    input: UpdateShoppingItemInput,
  ): Promise<ShoppingListResponse> {
    const list = await this.requireList(scope, id);
    if (!list.items.some((item) => item.id === itemId)) {
      throw this.itemNotFound(id, itemId);
    }
    const nextItems: MergeableItem[] = list.items.map((item) => {
      const base = toMergeable(item);
      if (item.id !== itemId) {
        return base;
      }
      return {
        ...base,
        name: input.name ?? base.name,
        quantity: input.quantity !== undefined ? input.quantity : base.quantity,
        unit: input.unit !== undefined ? input.unit : base.unit,
        category: input.category !== undefined ? input.category : base.category,
        bought: input.bought ?? base.bought,
      };
    });
    const updated = await this.lists.updateWithVersion(
      scope,
      list.id,
      input.expectedVersion,
      { items: nextItems as unknown as ShoppingItem[] },
    );
    return toResponse(updated);
  }

  /** Removes an item; version-guarded so a stale write is a 409. */
  async deleteItem(
    scope: ScopeContext,
    id: string,
    itemId: string,
    expectedVersion: number,
  ): Promise<ShoppingListResponse> {
    const list = await this.requireList(scope, id);
    if (!list.items.some((item) => item.id === itemId)) {
      throw this.itemNotFound(id, itemId);
    }
    const nextItems = list.items
      .filter((item) => item.id !== itemId)
      .map(toMergeable);
    const updated = await this.lists.updateWithVersion(
      scope,
      list.id,
      expectedVersion,
      { items: nextItems as unknown as ShoppingItem[] },
    );
    return toResponse(updated);
  }

  /**
   * Merges `needed` into a resolved list, converging under concurrency. It
   * re-reads the list (via `resolve`) and re-merges on an optimistic-lock 409,
   * bounded by {@link MAX_MERGE_ATTEMPTS}. When `resolve` finds no list, `create`
   * (if given) seeds one; otherwise a missing list is a 404. Because the merge is
   * idempotent, a retry never duplicates or drops items.
   */
  private async mergeConverge(
    scope: ScopeContext,
    needed: NeededItem[],
    resolve: () => Promise<ShoppingListDoc | null>,
    create: (() => Promise<ShoppingListDoc>) | null,
  ): Promise<ShoppingListResponse> {
    for (let attempt = 0; attempt < MAX_MERGE_ATTEMPTS; attempt += 1) {
      const list = await resolve();
      if (!list) {
        if (create) {
          return toResponse(await create());
        }
        throw new NotFoundException({
          code: ErrorCode.NOT_FOUND,
          message: "Shopping list not found",
        });
      }
      const nextItems = mergeNeededIntoItems(list.items.map(toMergeable), needed);
      try {
        const updated = await this.lists.updateWithVersion(
          scope,
          list.id,
          list.version,
          { items: nextItems as unknown as ShoppingItem[] },
        );
        return toResponse(updated);
      } catch (error) {
        // Another writer bumped the version first; re-read and re-merge. Only the
        // final attempt lets the conflict surface.
        if (
          isOptimisticLockConflict(error) &&
          attempt < MAX_MERGE_ATTEMPTS - 1
        ) {
          continue;
        }
        throw error;
      }
    }
    // The loop always returns or throws; this satisfies the type checker.
    throw new ConflictException({
      code: ErrorCode.OPTIMISTIC_LOCK_CONFLICT,
      message: "Could not merge items after repeated concurrent edits.",
    });
  }

  /** Creates the plan's list, healing a concurrent duplicate-create race. */
  private async createForPlan(
    scope: ScopeContext,
    mealPlanId: string,
    needed: NeededItem[],
  ): Promise<ShoppingListResponse> {
    const items = mergeNeededIntoItems([], needed);
    try {
      const created = await this.lists.create(scope, {
        mealPlanId,
        items: items as unknown as ShoppingItem[],
      } as unknown as Partial<ShoppingListEntity>);
      return toResponse(created);
    } catch (error) {
      // A concurrent generate for the same plan won the unique-index race; merge
      // into the list it inserted rather than surfacing the conflict.
      if (isDuplicateKeyError(error)) {
        return this.mergeConverge(
          scope,
          needed,
          () => this.lists.findByMealPlanId(scope, mealPlanId),
          null,
        );
      }
      throw error;
    }
  }

  private async requireList(
    scope: ScopeContext,
    id: string,
  ): Promise<ShoppingListDoc> {
    const list = await this.lists.findById(scope, id);
    if (!list) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: "Shopping list not found",
        details: { id },
      });
    }
    return list;
  }

  private itemNotFound(id: string, itemId: string): NotFoundException {
    return new NotFoundException({
      code: ErrorCode.NOT_FOUND,
      message: "Shopping list item not found",
      details: { id, itemId },
    });
  }
}

/** Whether an error is the repository's optimistic-lock 409 (stale version). */
function isOptimisticLockConflict(error: unknown): boolean {
  if (!(error instanceof ConflictException)) {
    return false;
  }
  const response = error.getResponse();
  return (
    typeof response === "object" &&
    response !== null &&
    (response as { code?: string }).code === ErrorCode.OPTIMISTIC_LOCK_CONFLICT
  );
}

/** Plain merge-ready copy of an embedded item (string sourceRecipeId). */
function toMergeable(item: ShoppingItem): MergeableItem {
  return {
    id: item.id,
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
    category: item.category,
    bought: item.bought,
    sourceRecipeId: item.sourceRecipeId?.toString() ?? null,
  };
}

function toItemResponse(item: ShoppingItem): ShoppingItemContract {
  return {
    id: item.id,
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
    category: item.category,
    bought: item.bought,
    sourceRecipeId: item.sourceRecipeId?.toString() ?? null,
  };
}

function toResponse(list: ShoppingListDoc): ShoppingListResponse {
  return {
    id: list.id,
    scope: list.scope,
    mealPlanId: list.mealPlanId?.toString() ?? null,
    items: list.items.map(toItemResponse),
    version: list.version,
    createdAt: (list.createdAt ?? new Date()).toISOString(),
    updatedAt: (list.updatedAt ?? new Date()).toISOString(),
  };
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
