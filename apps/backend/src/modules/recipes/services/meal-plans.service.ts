import { randomUUID } from "node:crypto";
import { Injectable, NotFoundException } from "@nestjs/common";
import type {
  AutoFillInput,
  AutoFillResponse,
  CreateMealPlanInput,
  MealPlanResponse,
  MealPlanSlot,
  MealType,
  UpdateSlotInput,
} from "@kitchenpal/api-contract";
import { Types, type HydratedDocument } from "mongoose";
import { isDuplicateKeyError } from "../../../common/database/mongo-errors";
import { ErrorCode } from "../../../common/http/error-codes";
import type { ScopeContext } from "../../../common/scope/scope-context";
import {
  MealPlanRepository,
  type MealPlanEntity,
} from "../repositories/meal-plan.repository";
import {
  RecipeRepository,
  type RecipeEntity,
} from "../repositories/recipe.repository";
import { MealPlanSlotItem } from "../schemas/meal-plan.schema";
import { RecipeSelectionService } from "./recipe-selection.service";

const DAYS_PER_WEEK = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

type MealPlanDoc = HydratedDocument<MealPlanEntity>;
type RecipeDoc = HydratedDocument<RecipeEntity>;

/**
 * Weekly meal-plan lifecycle: create (pre-generating empty slots for every day ×
 * meal type), read the current week, atomic version-guarded slot edits, AI
 * auto-fill, and clear. All access is scope-partitioned. Auto-fill respects the
 * caller's dietary preferences and available pantry and only ever assigns
 * EXISTING recipes — it never fabricates content and only fills valid slots.
 */
@Injectable()
export class MealPlansService {
  constructor(
    private readonly plans: MealPlanRepository,
    private readonly recipes: RecipeRepository,
    private readonly selection: RecipeSelectionService,
  ) {}

  async create(
    scope: ScopeContext,
    input: CreateMealPlanInput,
  ): Promise<MealPlanResponse> {
    const weekStart = startOfDayUtc(input.weekStart);
    const existing = await this.plans.findByWeekStart(scope, weekStart);
    if (existing) {
      // A plan for that week already exists; return it rather than duplicating.
      return this.toResponse(scope, existing);
    }
    const slots = generateSlots(input.mealTypes);
    try {
      const doc = await this.plans.create(scope, {
        weekStart,
        slots,
      } as Partial<MealPlanEntity>);
      return this.toResponse(scope, doc);
    } catch (error) {
      // A concurrent create for the same week lost the unique-index race; return
      // the plan the winner inserted rather than surfacing the conflict.
      if (isDuplicateKeyError(error)) {
        const winner = await this.plans.findByWeekStart(scope, weekStart);
        if (winner) {
          return this.toResponse(scope, winner);
        }
      }
      throw error;
    }
  }

  async getCurrent(scope: ScopeContext): Promise<MealPlanResponse> {
    const thisWeek = startOfWeekUtc(new Date());
    const current =
      (await this.plans.findByWeekStart(scope, thisWeek)) ??
      (await this.plans.findLatest(scope));
    if (!current) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: "No meal plan found",
      });
    }
    return this.toResponse(scope, current);
  }

  async getById(scope: ScopeContext, id: string): Promise<MealPlanResponse> {
    return this.toResponse(scope, await this.requirePlan(scope, id));
  }

  async updateSlot(
    scope: ScopeContext,
    id: string,
    slotId: string,
    input: UpdateSlotInput,
  ): Promise<MealPlanResponse> {
    const plan = await this.requirePlan(scope, id);
    const slot = plan.slots.find((item) => item.id === slotId);
    if (!slot) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: "Slot not found",
        details: { id, slotId },
      });
    }
    if (input.recipeId) {
      // A slot may only reference a recipe the caller can read.
      await this.requireReadableRecipe(scope, input.recipeId);
    }
    const nextSlots = plan.slots.map((item) =>
      item.id === slotId
        ? { ...toPlainSlot(item), recipeId: toObjectId(input.recipeId) }
        : toPlainSlot(item),
    );
    // The version guard makes the edit atomic: a concurrent edit that already
    // bumped the version fails with 409 rather than silently losing an update.
    const updated = await this.plans.updateWithVersion(
      scope,
      plan.id,
      input.expectedVersion,
      { slots: nextSlots },
    );
    return this.toResponse(scope, updated);
  }

  async autoFill(
    scope: ScopeContext,
    id: string,
    input: AutoFillInput,
  ): Promise<AutoFillResponse> {
    const plan = await this.requirePlan(scope, id);
    const targets = plan.slots.filter(
      (slot) => input.overwrite || slot.recipeId === null,
    );
    const mealTypes = unique(targets.map((slot) => slot.mealType));

    // Rank candidate recipes once per meal type (respecting diet + pantry).
    const rankedByMeal = new Map<MealType, RecipeDoc[]>();
    let provider = "none";
    let anyAi = false;
    for (const mealType of mealTypes) {
      const result = await this.selection.select(scope, {
        mealType,
        operation: "mealplan.autofill",
        goal: `Fill the ${mealType} slots of a weekly meal plan`,
        userId: scope.userId,
        context: { now: new Date(), vegetarianDay: false },
      });
      rankedByMeal.set(
        mealType,
        result.ranked.map((entry) => entry.doc),
      );
      if (!result.degraded) {
        anyAi = true;
        provider = result.provider;
      }
    }

    const cursors = new Map<MealType, number>();
    const filledSlotIds: string[] = [];
    const nextSlots = plan.slots.map((slot) => {
      const plain = toPlainSlot(slot);
      const isTarget = input.overwrite || slot.recipeId === null;
      if (!isTarget) {
        return plain;
      }
      const candidates = rankedByMeal.get(slot.mealType) ?? [];
      if (candidates.length === 0) {
        return plain;
      }
      // Cycle through candidates so a short list still fills the whole week.
      const index = cursors.get(slot.mealType) ?? 0;
      const chosen = candidates[index % candidates.length];
      if (!chosen) {
        return plain;
      }
      cursors.set(slot.mealType, index + 1);
      filledSlotIds.push(slot.id);
      return { ...plain, recipeId: new Types.ObjectId(chosen.id) };
    });

    const persisted =
      filledSlotIds.length > 0
        ? await this.plans.updateWithVersion(scope, plan.id, plan.version, {
            slots: nextSlots,
          })
        : plan;

    return {
      plan: await this.toResponse(scope, persisted),
      filledSlotIds,
      provider: anyAi ? provider : "none",
      degraded: !anyAi,
      // No candidate matched the constraints and nothing was filled → manual.
      needsManual: filledSlotIds.length === 0 && targets.length > 0,
    };
  }

  async clear(scope: ScopeContext, id: string): Promise<MealPlanResponse> {
    const plan = await this.requirePlan(scope, id);
    const cleared = plan.slots.map((slot) => ({
      ...toPlainSlot(slot),
      recipeId: null,
    }));
    const updated = await this.plans.updateWithVersion(
      scope,
      plan.id,
      plan.version,
      { slots: cleared },
    );
    return this.toResponse(scope, updated);
  }

  private async requirePlan(
    scope: ScopeContext,
    id: string,
  ): Promise<MealPlanDoc> {
    const plan = await this.plans.findById(scope, id);
    if (!plan) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: "Meal plan not found",
        details: { id },
      });
    }
    return plan;
  }

  private async requireReadableRecipe(
    scope: ScopeContext,
    id: string,
  ): Promise<void> {
    const recipe = await this.recipes.findReadableById(scope, id);
    if (!recipe) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: "Recipe not found",
        details: { id },
      });
    }
  }

  /** Projects a plan to its response, resolving recipe summaries for filled slots. */
  private async toResponse(
    scope: ScopeContext,
    plan: MealPlanDoc,
  ): Promise<MealPlanResponse> {
    const recipeIds = plan.slots
      .map((slot) => slot.recipeId?.toString())
      .filter((value): value is string => Boolean(value));
    const recipes = await this.recipes.findReadableByIds(scope, recipeIds);
    const byId = new Map(recipes.map((doc) => [doc.id, doc]));

    const slots: MealPlanSlot[] = plan.slots.map((slot) => {
      const recipeId = slot.recipeId?.toString() ?? null;
      const recipe = recipeId ? byId.get(recipeId) : undefined;
      return {
        id: slot.id,
        dayOfWeek: slot.dayOfWeek,
        mealType: slot.mealType,
        recipeId: recipe ? recipeId : null,
        recipeName: recipe?.name ?? null,
        recipeImageUrl: recipe?.imageUrl ?? null,
      };
    });

    return {
      id: plan.id,
      scope: plan.scope,
      weekStart: plan.weekStart.toISOString(),
      slots,
      version: plan.version,
      createdAt: (plan.createdAt ?? new Date()).toISOString(),
      updatedAt: (plan.updatedAt ?? new Date()).toISOString(),
    };
  }
}

/** Builds empty slots for every day of the week × requested meal type. */
function generateSlots(mealTypes: MealType[]): MealPlanSlotItem[] {
  const slots: MealPlanSlotItem[] = [];
  for (let day = 0; day < DAYS_PER_WEEK; day += 1) {
    for (const mealType of mealTypes) {
      slots.push({
        id: randomUUID(),
        dayOfWeek: day,
        mealType,
        recipeId: null,
      });
    }
  }
  return slots;
}

/** Plain copy of an embedded slot (drops Mongoose subdocument machinery). */
function toPlainSlot(slot: MealPlanSlotItem): MealPlanSlotItem {
  return {
    id: slot.id,
    dayOfWeek: slot.dayOfWeek,
    mealType: slot.mealType,
    recipeId: slot.recipeId,
  };
}

function toObjectId(id: string | null): Types.ObjectId | null {
  return id ? new Types.ObjectId(id) : null;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

/** UTC start-of-day for the given date. */
function startOfDayUtc(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

/** UTC Monday-midnight of the week containing `date`. */
function startOfWeekUtc(date: Date): Date {
  const day = startOfDayUtc(date);
  // getUTCDay: 0 = Sunday … 6 = Saturday; shift so Monday is the week start.
  const weekday = (day.getUTCDay() + 6) % 7;
  return new Date(day.getTime() - weekday * MS_PER_DAY);
}
