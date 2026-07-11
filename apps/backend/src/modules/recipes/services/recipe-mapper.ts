import type { RecipeResponse } from "@kitchenpal/api-contract";
import type { ScopeContext } from "../../../common/scope/scope-context";
import type { RecipeEntity } from "../repositories/recipe.repository";
import type { HydratedDocument } from "mongoose";

type RecipeDoc = HydratedDocument<RecipeEntity>;

/**
 * Whether `scope` owns `doc` and may edit/delete/publish it. Ownership is by the
 * scope filter: personal → same creator, household → same household, system →
 * admins only. A published community recipe is readable by all but still owned
 * only by its creator.
 */
export function isRecipeOwner(scope: ScopeContext, doc: RecipeDoc): boolean {
  switch (scope.scope) {
    case "personal":
      return doc.scope === "personal" && doc.createdBy?.toString() === scope.userId;
    case "household":
      return (
        doc.scope === "household" &&
        doc.householdId?.toString() === scope.householdId
      );
    case "system":
      return doc.scope === "system";
  }
}

/** Projects a recipe document into its API response, stamping `isOwner`. */
export function toRecipeResponse(
  doc: RecipeDoc,
  scope: ScopeContext,
): RecipeResponse {
  return {
    id: doc.id,
    scope: doc.scope,
    name: doc.name,
    mealType: doc.mealType,
    tags: doc.tags,
    cookTimeMinutes: doc.cookTimeMinutes ?? null,
    servings: doc.servings ?? null,
    ingredients: doc.ingredients.map((item) => ({
      name: item.name,
      quantity: item.quantity ?? null,
      unit: item.unit ?? null,
      optional: item.optional,
    })),
    steps: doc.steps,
    sourceType: doc.sourceType,
    imageUrl: doc.imageUrl ?? null,
    averageRating: doc.averageRating,
    reviewCount: doc.reviewCount,
    viewCount: doc.viewCount,
    published: doc.published,
    isOwner: isRecipeOwner(scope, doc),
    version: doc.version,
    createdAt: (doc.createdAt ?? new Date()).toISOString(),
    updatedAt: (doc.updatedAt ?? new Date()).toISOString(),
  };
}
