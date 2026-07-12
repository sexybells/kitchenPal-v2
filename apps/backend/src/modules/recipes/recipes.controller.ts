import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  communityQuerySchema,
  confirmImportSchema,
  createCommentSchema,
  createRecipeSchema,
  externalSearchQuerySchema,
  importFromUrlSchema,
  objectIdSchema,
  publishRecipeSchema,
  recipeQuerySchema,
  suggestionQuerySchema,
  updatePreferenceSchema,
  updateRecipeSchema,
  type CommunityQuery,
  type ConfirmImportInput,
  type CreateCommentInput,
  type CreateRecipeInput,
  type ExternalSearchQuery,
  type ExternalSearchResponse,
  type ImportFromUrlInput,
  type ImportFromUrlResponse,
  type PantryMatchResponse,
  type PublishRecipeInput,
  type RecipeCommentResponse,
  type RecipePreferenceResponse,
  type RecipeQuery,
  type RecipeResponse,
  type SuggestionQuery,
  type SuggestionsResponse,
  type UpdatePreferenceInput,
  type UpdateRecipeInput,
} from "@kitchenpal/api-contract";
import type { PageResult } from "../../common/http/page-result";
import {
  CurrentScope,
  HouseholdScope,
  Scope,
} from "../../common/scope/scope.decorator";
import type { ScopeContext } from "../../common/scope/scope-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { RecipesService } from "./services/recipes.service";

/**
 * Recipes: personal/household/system CRUD, the community feed, publish,
 * favorites, ratings/comments, dietary preferences, AI suggestions, external
 * search, URL import (draft → confirm), and pantry-match. Recipe content,
 * favorites, and ratings are `@HouseholdScope()` — a household shares its recipe
 * collection, favorites, and reviews, while a solo user keeps their own. Dietary
 * PREFERENCES stay `@Scope("personal")`: allergens and diet are per-user safety
 * data that must never be blended across members. The service applies the
 * cross-scope visibility rules for reads (own/household + community + system).
 *
 * Static sub-paths are declared before the `:id` routes so they are matched
 * first (Nest resolves routes in declaration order).
 */
@ApiTags("recipes")
@ApiBearerAuth()
@Controller("recipes")
export class RecipesController {
  constructor(private readonly recipes: RecipesService) {}

  @Get()
  @HouseholdScope()
  @ApiOperation({ summary: "List recipes in the active scope (personal or household)" })
  list(
    @CurrentScope() scope: ScopeContext,
    @Query(new ZodValidationPipe(recipeQuerySchema)) query: RecipeQuery,
  ): Promise<PageResult<RecipeResponse>> {
    return this.recipes.list(scope, query);
  }

  @Post()
  @HouseholdScope()
  @ApiOperation({ summary: "Create a recipe" })
  create(
    @CurrentScope() scope: ScopeContext,
    @Body(new ZodValidationPipe(createRecipeSchema)) body: CreateRecipeInput,
  ): Promise<RecipeResponse> {
    return this.recipes.create(scope, body);
  }

  @Get("community")
  @HouseholdScope()
  @ApiOperation({ summary: "Browse published community recipes" })
  community(
    @CurrentScope() scope: ScopeContext,
    @Query(new ZodValidationPipe(communityQuerySchema)) query: CommunityQuery,
  ): Promise<PageResult<RecipeResponse>> {
    return this.recipes.listCommunity(scope, query);
  }

  @Get("favorites")
  @HouseholdScope()
  @ApiOperation({ summary: "List favorite recipes in the active scope (personal or household)" })
  favorites(
    @CurrentScope() scope: ScopeContext,
  ): Promise<{ recipes: RecipeResponse[] }> {
    return this.recipes.listFavorites(scope).then((recipes) => ({ recipes }));
  }

  @Get("preferences")
  @Scope("personal")
  @ApiOperation({ summary: "Get the caller's recipe preferences" })
  getPreferences(
    @CurrentScope() scope: ScopeContext,
  ): Promise<RecipePreferenceResponse> {
    return this.recipes.getPreferences(scope);
  }

  @Patch("preferences")
  @Scope("personal")
  @ApiOperation({ summary: "Update the caller's recipe preferences" })
  updatePreferences(
    @CurrentScope() scope: ScopeContext,
    @Body(new ZodValidationPipe(updatePreferenceSchema))
    body: UpdatePreferenceInput,
  ): Promise<RecipePreferenceResponse> {
    return this.recipes.updatePreferences(scope, body);
  }

  @Post("ai-suggestions/preferences")
  @HouseholdScope()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "AI recipe suggestions from dietary preferences" })
  suggestFromPreferences(
    @CurrentScope() scope: ScopeContext,
    @Body(new ZodValidationPipe(suggestionQuerySchema)) body: SuggestionQuery,
  ): Promise<SuggestionsResponse> {
    return this.recipes.suggestFromPreferences(scope, body);
  }

  @Post("ai-suggestions/pantry")
  @HouseholdScope()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "AI recipe suggestions from available pantry" })
  suggestFromPantry(
    @CurrentScope() scope: ScopeContext,
    @Body(new ZodValidationPipe(suggestionQuerySchema)) body: SuggestionQuery,
  ): Promise<SuggestionsResponse> {
    return this.recipes.suggestFromPantry(scope, body);
  }

  @Get("external-search")
  @HouseholdScope()
  @ApiOperation({ summary: "Search the web for recipes (Google Custom Search)" })
  externalSearch(
    @CurrentScope() scope: ScopeContext,
    @Query(new ZodValidationPipe(externalSearchQuerySchema))
    query: ExternalSearchQuery,
  ): Promise<ExternalSearchResponse> {
    return this.recipes.search(scope, query.q, query.limit);
  }

  @Post("import-from-url")
  @HouseholdScope()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Scrape a URL into a reviewable recipe draft" })
  importFromUrl(
    @CurrentScope() scope: ScopeContext,
    @Body(new ZodValidationPipe(importFromUrlSchema)) body: ImportFromUrlInput,
  ): Promise<ImportFromUrlResponse> {
    return this.recipes.importFromUrl(scope, body.url);
  }

  @Post("imports/confirm")
  @HouseholdScope()
  @ApiOperation({ summary: "Create a recipe from a confirmed import draft" })
  confirmImport(
    @CurrentScope() scope: ScopeContext,
    @Body(new ZodValidationPipe(confirmImportSchema)) body: ConfirmImportInput,
  ): Promise<RecipeResponse> {
    return this.recipes.confirmImport(scope, body);
  }

  @Get(":id")
  @HouseholdScope()
  @ApiOperation({ summary: "Get a recipe (own, community, or system)" })
  getById(
    @CurrentScope() scope: ScopeContext,
    @Param("id", new ZodValidationPipe(objectIdSchema)) id: string,
  ): Promise<RecipeResponse> {
    return this.recipes.getById(scope, id);
  }

  @Patch(":id")
  @HouseholdScope()
  @ApiOperation({ summary: "Update an owned recipe" })
  update(
    @CurrentScope() scope: ScopeContext,
    @Param("id", new ZodValidationPipe(objectIdSchema)) id: string,
    @Body(new ZodValidationPipe(updateRecipeSchema)) body: UpdateRecipeInput,
  ): Promise<RecipeResponse> {
    return this.recipes.update(scope, id, body);
  }

  @Delete(":id")
  @HouseholdScope()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Soft-delete an owned recipe" })
  async remove(
    @CurrentScope() scope: ScopeContext,
    @Param("id", new ZodValidationPipe(objectIdSchema)) id: string,
  ): Promise<{ deleted: boolean }> {
    await this.recipes.remove(scope, id);
    return { deleted: true };
  }

  @Patch(":id/publish")
  @HouseholdScope()
  @ApiOperation({ summary: "Publish (or unpublish) an owned recipe to community" })
  publish(
    @CurrentScope() scope: ScopeContext,
    @Param("id", new ZodValidationPipe(objectIdSchema)) id: string,
    @Body(new ZodValidationPipe(publishRecipeSchema)) body: PublishRecipeInput,
  ): Promise<RecipeResponse> {
    return this.recipes.setPublished(scope, id, body);
  }

  @Post(":id/favorite")
  @HouseholdScope()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Mark a recipe as a favorite" })
  addFavorite(
    @CurrentScope() scope: ScopeContext,
    @Param("id", new ZodValidationPipe(objectIdSchema)) id: string,
  ): Promise<{ favorite: boolean }> {
    return this.recipes.toggleFavorite(scope, id, true);
  }

  @Delete(":id/favorite")
  @HouseholdScope()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Remove a recipe from favorites" })
  removeFavorite(
    @CurrentScope() scope: ScopeContext,
    @Param("id", new ZodValidationPipe(objectIdSchema)) id: string,
  ): Promise<{ favorite: boolean }> {
    return this.recipes.toggleFavorite(scope, id, false);
  }

  @Post(":id/comments")
  @HouseholdScope()
  @ApiOperation({ summary: "Rate/review a recipe (recomputes its rating)" })
  addComment(
    @CurrentScope() scope: ScopeContext,
    @Param("id", new ZodValidationPipe(objectIdSchema)) id: string,
    @Body(new ZodValidationPipe(createCommentSchema)) body: CreateCommentInput,
  ): Promise<RecipeCommentResponse> {
    return this.recipes.addComment(scope, id, body);
  }

  @Get(":id/comments")
  @HouseholdScope()
  @ApiOperation({ summary: "List a recipe's ratings/reviews" })
  listComments(
    @CurrentScope() scope: ScopeContext,
    @Param("id", new ZodValidationPipe(objectIdSchema)) id: string,
  ): Promise<{ comments: RecipeCommentResponse[] }> {
    return this.recipes
      .listComments(scope, id)
      .then((comments) => ({ comments }));
  }

  @Post(":id/pantry-match")
  @HouseholdScope()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Classify a recipe's ingredients vs. the pantry" })
  pantryMatch(
    @CurrentScope() scope: ScopeContext,
    @Param("id", new ZodValidationPipe(objectIdSchema)) id: string,
  ): Promise<PantryMatchResponse> {
    return this.recipes.pantryMatch(scope, id);
  }
}
