import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { APP_CONFIG, type AppConfig } from "../../config/env.schema";
import { AuthModule } from "../auth/auth.module";
import { LogsModule } from "../logs/logs.module";
import { PantryModule } from "../pantry/pantry.module";
import { UploadsModule } from "../uploads/uploads.module";
import { UsersModule } from "../users/users.module";
import { ExternalSearchService } from "./ai/external-search.service";
import { GeminiRecipeProvider } from "./ai/gemini-recipe.provider";
import { OpenAiRecipeProvider } from "./ai/openai-recipe.provider";
import { RecipeAiService } from "./ai/recipe-ai.service";
import {
  RECIPE_AI_PROVIDERS,
  type RecipeAiProvider,
} from "./ai/recipe-ai-provider";
import {
  FetchRecipeHttpClient,
  RECIPE_HTTP_CLIENT,
} from "./ai/recipe-http-client";
import { RecipeImportService } from "./ai/recipe-import.service";
import { MealPlansController } from "./meal-plans.controller";
import { MealPlanRepository } from "./repositories/meal-plan.repository";
import { RecipeRepository } from "./repositories/recipe.repository";
import { RecipeCommentRepository } from "./repositories/recipe-comment.repository";
import { RecipeFavoriteRepository } from "./repositories/recipe-favorite.repository";
import { RecipePreferenceRepository } from "./repositories/recipe-preference.repository";
import { RecipesController } from "./recipes.controller";
import { MealPlan, MealPlanSchema } from "./schemas/meal-plan.schema";
import { Recipe, RecipeSchema } from "./schemas/recipe.schema";
import {
  RecipeComment,
  RecipeCommentSchema,
} from "./schemas/recipe-comment.schema";
import {
  RecipeFavorite,
  RecipeFavoriteSchema,
} from "./schemas/recipe-favorite.schema";
import {
  RecipePreference,
  RecipePreferenceSchema,
} from "./schemas/recipe-preference.schema";
import { DayContextService } from "./services/day-context.service";
import { MealPlansService } from "./services/meal-plans.service";
import { RecipeSelectionService } from "./services/recipe-selection.service";
import { RecipesService } from "./services/recipes.service";
import { SystemRecipeImageService } from "./services/system-recipe-image.service";
import { SystemRecipeSeederService } from "./services/system-recipe-seeder.service";

/**
 * Builds the ordered text-LLM provider chain for suggestions and auto-fill:
 * OpenAI primary, Gemini fallback. A provider is only constructed when its key
 * is present, so with no keys the array is empty and ranking degrades to
 * deterministic heuristics — never a crash, never fabricated recipes.
 */
const recipeAiProvidersProvider = {
  provide: RECIPE_AI_PROVIDERS,
  inject: [APP_CONFIG],
  useFactory: (config: AppConfig): RecipeAiProvider[] => {
    const providers: RecipeAiProvider[] = [];
    if (config.OPENAI_API_KEY) {
      providers.push(
        new OpenAiRecipeProvider({
          apiKey: config.OPENAI_API_KEY,
          model: config.OPENAI_TEXT_MODEL,
          maxTokens: config.AI_SUGGESTION_MAX_TOKENS,
        }),
      );
    }
    if (config.GEMINI_API_KEY) {
      providers.push(
        new GeminiRecipeProvider({
          apiKey: config.GEMINI_API_KEY,
          model: config.GEMINI_TEXT_MODEL,
          maxTokens: config.AI_SUGGESTION_MAX_TOKENS,
        }),
      );
    }
    return providers;
  },
};

/** Default outbound HTTP client for search/scrape; overridable in tests. */
const httpClientProvider = {
  provide: RECIPE_HTTP_CLIENT,
  useClass: FetchRecipeHttpClient,
};

/**
 * Recipes & meal-plans module: recipe CRUD/community/favorites/comments/prefs,
 * AI suggestions and meal auto-fill (reusing the Phase 4 AI-log audit trail),
 * external search and URL import, and pantry-match (reusing pantry stock via
 * PantryModule). External calls are logged to ExternalSearchLog (LogsModule).
 */
@Module({
  imports: [
    AuthModule,
    LogsModule,
    PantryModule,
    // Bundled dish photography goes through the same storage transport as every
    // upload, so the seeded recipes never serve images from the source tree.
    UploadsModule,
    // Day context reads the user's time zone and vegetarian-day opt-in.
    UsersModule,
    MongooseModule.forFeature([
      { name: Recipe.name, schema: RecipeSchema },
      { name: RecipePreference.name, schema: RecipePreferenceSchema },
      { name: RecipeFavorite.name, schema: RecipeFavoriteSchema },
      { name: RecipeComment.name, schema: RecipeCommentSchema },
      { name: MealPlan.name, schema: MealPlanSchema },
    ]),
  ],
  controllers: [RecipesController, MealPlansController],
  providers: [
    RecipesService,
    MealPlansService,
    RecipeSelectionService,
    DayContextService,
    SystemRecipeSeederService,
    SystemRecipeImageService,
    RecipeAiService,
    RecipeImportService,
    ExternalSearchService,
    RecipeRepository,
    RecipePreferenceRepository,
    RecipeFavoriteRepository,
    RecipeCommentRepository,
    MealPlanRepository,
    recipeAiProvidersProvider,
    httpClientProvider,
  ],
  // Shopping (a later phase) generates lists from a meal plan's recipes, so it
  // needs to resolve plans and read recipe ingredients within scope. The seeder
  // is exported for the admin dev tool and the standalone seed script.
  exports: [
    DayContextService,
    // The reminder job picks its dishes with the same ranking (useAi: false).
    RecipeSelectionService,
    MealPlanRepository,
    RecipeRepository,
    SystemRecipeSeederService,
    SystemRecipeImageService,
  ],
})
export class RecipesModule {}
