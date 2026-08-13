import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { isDuplicateKeyError } from "../../../common/database/mongo-errors";
import { SYSTEM_RECIPES } from "../data/system-recipes.data";
import type { SystemRecipeSeed } from "../data/system-recipe";
import type { RecipeEntity } from "../repositories/recipe.repository";
import { Recipe } from "../schemas/recipe.schema";

/** Outcome of one seeding run, per seed recipe. */
export interface SystemRecipeSeedResult {
  /** Seeds inserted because no system recipe carried that name. */
  created: number;
  /** Existing system recipes whose authored content was refreshed. */
  updated: number;
  /** Seeds left alone — content already identical, or admin-removed. */
  skipped: number;
  /** Size of the seed library this run considered. */
  total: number;
}

/**
 * Seeds the server-owned ("system") recipe library.
 *
 * Unlike the dev tools this is SAFE IN PRODUCTION and intentionally so: without
 * a baseline library a fresh install has nothing for suggestions or meal-plan
 * auto-fill to choose from (both only ever rank EXISTING recipes). It is
 * therefore additive-only — it never deletes, never touches user-owned recipes,
 * and never writes server-controlled fields (ratings, review/view counts).
 *
 * Idempotent: keyed on `normalizedName` within `scope: "system"`, so re-running
 * converges instead of duplicating. Two behaviours are deliberate:
 *
 * - A **soft-deleted** system recipe is left deleted. An admin removing a seeded
 *   dish is a decision; a later deploy must not silently resurrect it.
 * - A **live** system recipe has its authored content refreshed, so fixing a
 *   typo or an ingredient in the seed file propagates on the next run. Fields the
 *   seed does not author (e.g. `imageUrl`) are preserved.
 */
@Injectable()
export class SystemRecipeSeederService {
  private readonly logger = new Logger(SystemRecipeSeederService.name);

  constructor(
    // Typed as the entity (schema class + plugin fields) so `deletedAt` and the
    // other base/scope fields are visible to reads.
    @InjectModel(Recipe.name) private readonly recipeModel: Model<RecipeEntity>,
  ) {}

  /**
   * Applies the seed library.
   *
   * @param actorId - Admin performing the seed, recorded as `createdBy` on newly
   * inserted recipes. Omitted for unattended runs (CLI/boot), which leave the
   * audit reference null rather than attributing content to an arbitrary user.
   */
  async seed(
    actorId?: string | null,
    seeds: readonly SystemRecipeSeed[] = SYSTEM_RECIPES,
  ): Promise<SystemRecipeSeedResult> {
    const owner = toObjectId(actorId);
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const seed of seeds) {
      const normalizedName = seed.name.trim().toLowerCase();
      const existing = await this.recipeModel
        .findOne({ normalizedName, scope: "system" })
        .lean()
        .exec();

      if (existing?.deletedAt) {
        skipped += 1;
        continue;
      }

      // Compare before writing. Mongoose stamps `updatedAt` on every update, so
      // an unconditional upsert would rewrite the whole library on each run —
      // reporting churn as real changes and touching rows a deploy never edited.
      if (existing && isUnchanged(existing, seed)) {
        skipped += 1;
        continue;
      }

      try {
        const result = await this.recipeModel
          .updateOne(
            { normalizedName, scope: "system", deletedAt: null },
            {
              $set: this.content(seed, owner),
              $setOnInsert: {
                normalizedName,
                scope: "system",
                deletedAt: null,
                version: 0,
                createdBy: owner,
              },
            },
            { upsert: true },
          )
          .exec();

        if (result.upsertedCount > 0) {
          created += 1;
        } else if (result.modifiedCount > 0) {
          updated += 1;
        } else {
          skipped += 1;
        }
      } catch (error) {
        // Another instance inserted the same dish between our read and upsert.
        // The unique partial index is the authority; converged state is correct.
        if (!isDuplicateKeyError(error)) {
          throw error;
        }
        skipped += 1;
      }
    }

    this.logger.log(
      `System recipes seeded: ${created} created, ${updated} updated, ${skipped} unchanged (of ${seeds.length}).`,
    );
    return { created, updated, skipped, total: seeds.length };
  }

  /** The fields a seed authors. Everything else is left to the schema/server. */
  private content(
    seed: SystemRecipeSeed,
    owner: Types.ObjectId | null,
  ): Record<string, unknown> {
    return {
      name: seed.name,
      mealType: seed.mealType,
      tags: seed.tags,
      cookTimeMinutes: seed.cookTimeMinutes,
      servings: seed.servings,
      ingredients: seed.ingredients.map((ingredient) => ({
        name: ingredient.name,
        quantity: ingredient.quantity ?? null,
        unit: ingredient.unit ?? null,
        optional: ingredient.optional ?? false,
      })),
      steps: seed.steps,
      sourceType: "system",
      published: true,
      updatedBy: owner,
    };
  }
}

/** Narrows an optional actor id to an ObjectId, tolerating unattended runs. */
function toObjectId(id?: string | null): Types.ObjectId | null {
  return id && Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : null;
}

/**
 * Whether a stored recipe already carries exactly the seed's authored content.
 * Only the fields a seed owns are compared — an admin-attached image, the
 * rating aggregate and the view counter are all irrelevant to "did the seed
 * change?".
 */
function isUnchanged(
  stored: Record<string, unknown>,
  seed: SystemRecipeSeed,
): boolean {
  const storedIngredients = Array.isArray(stored.ingredients)
    ? stored.ingredients
    : [];
  return (
    stored.name === seed.name &&
    stored.mealType === seed.mealType &&
    stored.sourceType === "system" &&
    stored.published === true &&
    stored.cookTimeMinutes === seed.cookTimeMinutes &&
    stored.servings === seed.servings &&
    sameStrings(stored.tags, seed.tags) &&
    sameStrings(stored.steps, seed.steps) &&
    storedIngredients.length === seed.ingredients.length &&
    seed.ingredients.every((ingredient, index) => {
      const current = storedIngredients[index] as
        | Record<string, unknown>
        | undefined;
      return (
        current?.name === ingredient.name &&
        current?.quantity === (ingredient.quantity ?? null) &&
        current?.unit === (ingredient.unit ?? null) &&
        current?.optional === (ingredient.optional ?? false)
      );
    })
  );
}

/** Order-sensitive equality for the plain string arrays a seed authors. */
function sameStrings(stored: unknown, seed: string[]): boolean {
  return (
    Array.isArray(stored) &&
    stored.length === seed.length &&
    seed.every((value, index) => stored[index] === value)
  );
}
