import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import type {
  CommunityQuery,
  ConfirmImportInput,
  CreateCommentInput,
  CreateRecipeInput,
  ExternalSearchResponse,
  ImportFromUrlResponse,
  PantryMatchResponse,
  PublishRecipeInput,
  RecipeCommentResponse,
  RecipePreferenceResponse,
  RecipeQuery,
  RecipeResponse,
  RecipeSuggestion,
  SuggestionQuery,
  SuggestionsResponse,
  UpdatePreferenceInput,
  UpdateRecipeInput,
} from "@kitchenpal/api-contract";
import {
  Types,
  type ClientSession,
  type Connection,
  type HydratedDocument,
} from "mongoose";
import { isDuplicateKeyError } from "../../../common/database/mongo-errors";
import { ErrorCode } from "../../../common/http/error-codes";
import { PageResult, paginate } from "../../../common/http/page-result";
import type { ScopeContext } from "../../../common/scope/scope-context";
import { UserRepository } from "../../auth/repositories/user.repository";
import { PantryItemRepository } from "../../pantry/repositories/pantry-item.repository";
import { ExternalSearchService } from "../ai/external-search.service";
import { RecipeImportService } from "../ai/recipe-import.service";
import {
  RecipeRepository,
  type RecipeEntity,
} from "../repositories/recipe.repository";
import {
  RecipeCommentRepository,
  type RecipeCommentEntity,
} from "../repositories/recipe-comment.repository";
import {
  RecipeFavoriteRepository,
  type RecipeFavoriteEntity,
} from "../repositories/recipe-favorite.repository";
import {
  RecipePreferenceRepository,
  type RecipePreferenceEntity,
} from "../repositories/recipe-preference.repository";
import { matchIngredients } from "./pantry-match";
import { toPreferenceResponse } from "./preference-filter";
import { isRecipeOwner, toRecipeResponse } from "./recipe-mapper";
import { RecipeSelectionService } from "./recipe-selection.service";

type RecipeDoc = HydratedDocument<RecipeEntity>;
type CommentDoc = HydratedDocument<RecipeCommentEntity>;

/** Lowercased key for case-insensitive lookup and duplicate detection. */
function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Recipe domain service: CRUD with scope-aware visibility, the community feed,
 * publish, favorites, ratings/comments, dietary preferences, AI suggestions,
 * pantry-match, and URL import (draft → confirm). Owner mutations run through the
 * scoped repository (a non-owner gets 403/404); cross-scope reads (community,
 * system, a recipe the caller can merely see) use the repository's explicit safe
 * read paths, never by disabling the scope filter.
 */
@Injectable()
export class RecipesService {
  constructor(
    private readonly recipes: RecipeRepository,
    private readonly favorites: RecipeFavoriteRepository,
    private readonly comments: RecipeCommentRepository,
    private readonly preferences: RecipePreferenceRepository,
    private readonly pantry: PantryItemRepository,
    private readonly selection: RecipeSelectionService,
    private readonly importer: RecipeImportService,
    private readonly externalSearch: ExternalSearchService,
    private readonly users: UserRepository,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async list(
    scope: ScopeContext,
    query: RecipeQuery,
  ): Promise<PageResult<RecipeResponse>> {
    const skip = decodeCursor(query.cursor);
    const { items, total } = await this.recipes.listOwn(scope, {
      mealType: query.mealType,
      tag: query.tag,
      search: query.search,
      sort: query.sort,
      skip,
      limit: query.limit,
    });
    return this.pageOf(items, scope, skip, total);
  }

  async listCommunity(
    scope: ScopeContext,
    query: CommunityQuery,
  ): Promise<PageResult<RecipeResponse>> {
    const skip = decodeCursor(query.cursor);
    const { items, total } = await this.recipes.listCommunity({
      mealType: query.mealType,
      tag: query.tag,
      search: query.search,
      sort: query.sort,
      skip,
      limit: query.limit,
    });
    return this.pageOf(items, scope, skip, total);
  }

  async create(
    scope: ScopeContext,
    input: CreateRecipeInput,
  ): Promise<RecipeResponse> {
    const doc = await this.recipes.create(scope, {
      name: input.name,
      normalizedName: normalizeName(input.name),
      mealType: input.mealType,
      tags: input.tags,
      cookTimeMinutes: input.cookTimeMinutes ?? null,
      servings: input.servings ?? null,
      ingredients: input.ingredients,
      steps: input.steps,
      sourceType: scope.scope === "system" ? "system" : "manual",
      imageUrl: input.imageUrl ?? null,
      published: false,
    } as Partial<RecipeEntity>);
    return toRecipeResponse(doc, scope);
  }

  /** Fetches a readable recipe and bumps its view counter (best-effort). */
  async getById(scope: ScopeContext, id: string): Promise<RecipeResponse> {
    const doc = await this.requireReadable(scope, id);
    await this.recipes.incrementView(id);
    doc.viewCount += 1;
    return toRecipeResponse(doc, scope);
  }

  async update(
    scope: ScopeContext,
    id: string,
    input: UpdateRecipeInput,
  ): Promise<RecipeResponse> {
    const existing = await this.requireOwned(scope, id);
    const update: Record<string, unknown> = {};
    if (input.name !== undefined) {
      update.name = input.name;
      update.normalizedName = normalizeName(input.name);
    }
    if (input.mealType !== undefined) {
      update.mealType = input.mealType;
    }
    if (input.tags !== undefined) {
      update.tags = input.tags;
    }
    if ("cookTimeMinutes" in input) {
      update.cookTimeMinutes = input.cookTimeMinutes ?? null;
    }
    if ("servings" in input) {
      update.servings = input.servings ?? null;
    }
    if (input.ingredients !== undefined) {
      update.ingredients = input.ingredients;
    }
    if (input.steps !== undefined) {
      update.steps = input.steps;
    }
    if ("imageUrl" in input) {
      update.imageUrl = input.imageUrl ?? null;
    }
    const updated = await this.recipes.updateWithVersion(
      scope,
      existing.id,
      existing.version,
      update,
    );
    return toRecipeResponse(updated, scope);
  }

  async remove(scope: ScopeContext, id: string): Promise<void> {
    const removed = await this.recipes.softDelete(scope, id);
    if (!removed) {
      // A recipe the caller can read but not own must not be deletable.
      await this.requireOwned(scope, id);
    }
  }

  async setPublished(
    scope: ScopeContext,
    id: string,
    input: PublishRecipeInput,
  ): Promise<RecipeResponse> {
    const existing = await this.requireOwned(scope, id);
    const updated = await this.recipes.updateWithVersion(
      scope,
      existing.id,
      existing.version,
      { published: input.published },
    );
    return toRecipeResponse(updated, scope);
  }

  async toggleFavorite(
    scope: ScopeContext,
    id: string,
    favorite: boolean,
  ): Promise<{ favorite: boolean }> {
    await this.requireReadable(scope, id);
    const existing = await this.favorites.findByRecipe(scope, id);
    if (favorite && !existing) {
      try {
        await this.favorites.create(scope, {
          recipeId: new Types.ObjectId(id),
        } as Partial<RecipeFavoriteEntity>);
      } catch (error) {
        // A concurrent double-favorite loses the unique-index race; the recipe
        // is already favorited, so treat it as success (idempotent).
        if (!isDuplicateKeyError(error)) {
          throw error;
        }
      }
    } else if (!favorite && existing) {
      await this.favorites.softDelete(scope, existing.id);
    }
    return { favorite };
  }

  async listFavorites(scope: ScopeContext): Promise<RecipeResponse[]> {
    const favorites = await this.favorites.listForOwner(scope);
    const ids = favorites.map((fav) => fav.recipeId.toString());
    const recipes = await this.recipes.findReadableByIds(scope, ids);
    // Preserve favorite order (newest first) and drop any no-longer-readable ids.
    const byId = new Map(recipes.map((doc) => [doc.id, doc]));
    return favorites
      .map((fav) => byId.get(fav.recipeId.toString()))
      .filter((doc): doc is RecipeDoc => Boolean(doc))
      .map((doc) => toRecipeResponse(doc, scope));
  }

  async getPreferences(
    scope: ScopeContext,
  ): Promise<RecipePreferenceResponse> {
    return toPreferenceResponse(await this.preferences.findForOwner(scope));
  }

  async updatePreferences(
    scope: ScopeContext,
    input: UpdatePreferenceInput,
  ): Promise<RecipePreferenceResponse> {
    const existing = await this.preferences.findForOwner(scope);
    if (!existing) {
      const created = await this.preferences.create(scope, {
        diet: input.diet ?? null,
        allergens: input.allergens ?? [],
        disliked: input.disliked ?? [],
        cuisines: input.cuisines ?? [],
      } as Partial<RecipePreferenceEntity>);
      return toPreferenceResponse(created);
    }
    const update: Record<string, unknown> = {};
    if ("diet" in input) {
      update.diet = input.diet ?? null;
    }
    if (input.allergens !== undefined) {
      update.allergens = input.allergens;
    }
    if (input.disliked !== undefined) {
      update.disliked = input.disliked;
    }
    if (input.cuisines !== undefined) {
      update.cuisines = input.cuisines;
    }
    const updated = await this.preferences.updateWithVersion(
      scope,
      existing.id,
      existing.version,
      update,
    );
    return toPreferenceResponse(updated);
  }

  async addComment(
    scope: ScopeContext,
    id: string,
    input: CreateCommentInput,
  ): Promise<RecipeCommentResponse> {
    await this.requireReadable(scope, id);
    const authorName = await this.resolveAuthorName(scope.userId);
    // Write the comment AND recompute the recipe aggregate in ONE transaction, so
    // two concurrent ratings cannot lose an update: a write-write conflict on the
    // recipe doc aborts the loser, which withTransaction retries against fresh
    // data — eliminating the old read-aggregate-then-blind-$set race.
    return this.inTransaction(async (session) => {
      // One rating per user per recipe: a repeat rating updates the caller's
      // existing one rather than stacking, so a single user cannot skew the
      // recipe's average or inflate the reviewer count.
      const existing = await this.comments.findOwnByRecipe(scope, id, session);
      const comment = existing
        ? await this.comments.updateWithVersion(
            scope,
            existing.id,
            existing.version,
            { rating: input.rating, text: input.text ?? null, authorName },
            session,
          )
        : await this.comments.create(
            scope,
            {
              recipeId: new Types.ObjectId(id),
              rating: input.rating,
              text: input.text ?? null,
              authorName,
            } as Partial<RecipeCommentEntity>,
            session,
          );
      const stats = await this.comments.ratingStatsFor(id, session);
      await this.recipes.applyRatingStats(id, stats, session);
      return toCommentResponse(comment);
    });
  }

  /**
   * Runs `work` inside a MongoDB transaction; a write conflict (e.g. a
   * concurrent rating recompute on the same recipe) aborts and the driver
   * retries the whole callback, keeping the rating aggregate consistent.
   */
  private async inTransaction<T>(
    work: (session: ClientSession) => Promise<T>,
  ): Promise<T> {
    const session = await this.connection.startSession();
    try {
      let result!: T;
      await session.withTransaction(async () => {
        result = await work(session);
      });
      return result;
    } finally {
      await session.endSession();
    }
  }

  private async resolveAuthorName(userId: string): Promise<string> {
    const user = await this.users.findById(userId);
    return user?.displayName ?? "";
  }

  async listComments(
    scope: ScopeContext,
    id: string,
  ): Promise<RecipeCommentResponse[]> {
    await this.requireReadable(scope, id);
    const comments = await this.comments.listByRecipe(id);
    return comments.map(toCommentResponse);
  }

  suggestFromPreferences(
    scope: ScopeContext,
    query: SuggestionQuery,
  ): Promise<SuggestionsResponse> {
    return this.buildSuggestions(scope, query, {
      operation: "recipe.suggest.preferences",
      goal: "Recipes matching the user's dietary preferences and cuisines",
    });
  }

  suggestFromPantry(
    scope: ScopeContext,
    query: SuggestionQuery,
  ): Promise<SuggestionsResponse> {
    return this.buildSuggestions(scope, query, {
      operation: "recipe.suggest.pantry",
      goal: "Recipes the user can cook now from what is in their pantry",
    });
  }

  async pantryMatch(
    scope: ScopeContext,
    id: string,
  ): Promise<PantryMatchResponse> {
    const recipe = await this.requireReadable(scope, id);
    const items = await this.pantry.find(scope);
    const stock = items.map((item) => ({
      id: item.id,
      name: item.name,
      stockState: item.stockState,
    }));
    const result = matchIngredients(recipe.ingredients, stock);
    const project = (match: (typeof result.matches)[number], keepId: boolean) => ({
      name: match.ingredient.name,
      quantity: match.ingredient.quantity ?? null,
      unit: match.ingredient.unit ?? null,
      optional: match.ingredient.optional,
      pantryItemId: keepId ? match.pantryItemId : null,
    });
    return {
      recipeId: recipe.id,
      totalIngredients: result.matches.length,
      availableCount: result.available.length,
      neededCount: result.needed.length,
      matchScore: Math.round(result.matchScore * 100) / 100,
      available: result.available.map((match) => project(match, true)),
      needed: result.needed.map((match) => project(match, false)),
    };
  }

  importFromUrl(
    scope: ScopeContext,
    url: string,
  ): Promise<ImportFromUrlResponse> {
    // Scrape + parse only — NEVER creates a recipe. The caller must confirm.
    return this.importer.importFromUrl(url, scope.userId);
  }

  async confirmImport(
    scope: ScopeContext,
    input: ConfirmImportInput,
  ): Promise<RecipeResponse> {
    const draft = input.draft;
    const doc = await this.recipes.create(scope, {
      name: draft.name,
      normalizedName: normalizeName(draft.name),
      mealType: draft.mealType,
      tags: draft.tags,
      cookTimeMinutes: draft.cookTimeMinutes ?? null,
      servings: draft.servings ?? null,
      ingredients: draft.ingredients,
      steps: draft.steps,
      sourceType: "import",
      imageUrl: draft.imageUrl ?? null,
      sourceUrl: draft.sourceUrl ?? null,
      published: false,
    } as Partial<RecipeEntity>);
    return toRecipeResponse(doc, scope);
  }

  search(
    scope: ScopeContext,
    query: string,
    limit: number,
  ): Promise<ExternalSearchResponse> {
    return this.externalSearch.search(query, limit, scope.userId);
  }

  private async buildSuggestions(
    scope: ScopeContext,
    query: SuggestionQuery,
    options: { operation: string; goal: string },
  ): Promise<SuggestionsResponse> {
    const selection = await this.selection.select(scope, {
      mealType: query.mealType,
      operation: options.operation,
      goal: options.goal,
      userId: scope.userId,
    });
    const suggestions: RecipeSuggestion[] = selection.ranked
      .slice(0, query.limit)
      .map(({ doc, match }) => ({
        recipeId: doc.id,
        name: doc.name,
        mealType: doc.mealType,
        imageUrl: doc.imageUrl ?? null,
        reason: buildReason(match.available.length, match.needed.length),
        matchScore: Math.round(match.matchScore * 100) / 100,
        availableCount: match.available.length,
        neededCount: match.needed.length,
      }));
    return {
      suggestions,
      provider: selection.provider,
      degraded: selection.degraded,
    };
  }

  private pageOf(
    items: RecipeDoc[],
    scope: ScopeContext,
    skip: number,
    total: number,
  ): PageResult<RecipeResponse> {
    const nextSkip = skip + items.length;
    const hasMore = nextSkip < total;
    return paginate(
      items.map((doc) => toRecipeResponse(doc, scope)),
      { nextCursor: hasMore ? encodeCursor(nextSkip) : null, total },
    );
  }

  /** Fetches a recipe the caller may read, else 404. */
  private async requireReadable(
    scope: ScopeContext,
    id: string,
  ): Promise<RecipeDoc> {
    const doc = await this.recipes.findReadableById(scope, id);
    if (!doc) {
      throw this.notFound(id);
    }
    return doc;
  }

  /**
   * Fetches a recipe the caller OWNS (may edit/delete/publish). A readable-but-
   * not-owned recipe yields 403; a truly missing one yields 404.
   */
  private async requireOwned(
    scope: ScopeContext,
    id: string,
  ): Promise<RecipeDoc> {
    const owned = await this.recipes.findById(scope, id);
    if (owned) {
      return owned;
    }
    const readable = await this.recipes.findReadableById(scope, id);
    if (readable && !isRecipeOwner(scope, readable)) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: "You can only modify your own recipes",
        details: { id },
      });
    }
    throw this.notFound(id);
  }

  private notFound(id: string): NotFoundException {
    return new NotFoundException({
      code: ErrorCode.NOT_FOUND,
      message: "Recipe not found",
      details: { id },
    });
  }
}

function toCommentResponse(doc: CommentDoc): RecipeCommentResponse {
  return {
    id: doc.id,
    recipeId: doc.recipeId.toString(),
    authorName: doc.authorName ?? "",
    rating: doc.rating,
    text: doc.text ?? null,
    createdAt: (doc.createdAt ?? new Date()).toISOString(),
  };
}

function buildReason(available: number, needed: number): string {
  if (needed === 0) {
    return "You have everything you need";
  }
  if (available === 0) {
    return "You will need to shop for the ingredients";
  }
  return `You have ${available} of ${available + needed} ingredients`;
}

function encodeCursor(offset: number): string {
  return Buffer.from(String(offset), "utf8").toString("base64url");
}

function decodeCursor(cursor: string | undefined): number {
  if (!cursor) {
    return 0;
  }
  const decoded = Number.parseInt(
    Buffer.from(cursor, "base64url").toString("utf8"),
    10,
  );
  return Number.isFinite(decoded) && decoded >= 0 ? decoded : 0;
}
