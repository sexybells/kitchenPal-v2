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
  consumePantrySchema,
  cookMealSchema,
  createPantryItemSchema,
  objectIdSchema,
  pantryItemQuerySchema,
  updatePantryItemSchema,
  type ConsumePantryInput,
  type ConsumeResult,
  type CookMealInput,
  type CookResult,
  type CreatePantryItemInput,
  type PantryItemQuery,
  type PantryItemResponse,
  type RefillSuggestion,
  type UpdatePantryItemInput,
} from "@kitchenpal/api-contract";
import type { PageResult } from "../../common/http/page-result";
import { CurrentScope, Scope } from "../../common/scope/scope.decorator";
import type { ScopeContext } from "../../common/scope/scope-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { PantryService } from "./services/pantry.service";

/**
 * Pantry items and the cook→deplete→refill loop. Every route is
 * `@Scope("personal")`, so the scope guard binds the caller to their own items.
 * Household-scoped pantries land with the household module in a later phase; the
 * schema and repository already support that scope.
 */
@ApiTags("pantry")
@ApiBearerAuth()
@Controller("pantry")
export class PantryController {
  constructor(private readonly pantry: PantryService) {}

  @Get("items")
  @Scope("personal")
  @ApiOperation({ summary: "List pantry items (filter, search, expiry sort)" })
  listItems(
    @CurrentScope() scope: ScopeContext,
    @Query(new ZodValidationPipe(pantryItemQuerySchema)) query: PantryItemQuery,
  ): Promise<PageResult<PantryItemResponse>> {
    return this.pantry.listItems(scope, query);
  }

  @Post("items")
  @Scope("personal")
  @ApiOperation({ summary: "Add a pantry item" })
  createItem(
    @CurrentScope() scope: ScopeContext,
    @Body(new ZodValidationPipe(createPantryItemSchema))
    body: CreatePantryItemInput,
  ): Promise<PantryItemResponse> {
    return this.pantry.createItem(scope, body);
  }

  @Patch("items/:id")
  @Scope("personal")
  @ApiOperation({ summary: "Update a pantry item" })
  updateItem(
    @CurrentScope() scope: ScopeContext,
    @Param("id", new ZodValidationPipe(objectIdSchema)) id: string,
    @Body(new ZodValidationPipe(updatePantryItemSchema))
    body: UpdatePantryItemInput,
  ): Promise<PantryItemResponse> {
    return this.pantry.updateItem(scope, id, body);
  }

  @Delete("items/:id")
  @Scope("personal")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Soft-delete a pantry item" })
  async deleteItem(
    @CurrentScope() scope: ScopeContext,
    @Param("id", new ZodValidationPipe(objectIdSchema)) id: string,
  ): Promise<{ deleted: boolean }> {
    await this.pantry.deleteItem(scope, id);
    return { deleted: true };
  }

  @Get("refill-suggestions")
  @Scope("personal")
  @ApiOperation({ summary: "Items running low/out to refill (shopping seam)" })
  refillSuggestions(
    @CurrentScope() scope: ScopeContext,
  ): Promise<{ suggestions: RefillSuggestion[] }> {
    return this.pantry.getRefillSuggestions(scope);
  }

  @Post("consume")
  @Scope("personal")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Deplete items after cooking" })
  consume(
    @CurrentScope() scope: ScopeContext,
    @Body(new ZodValidationPipe(consumePantrySchema)) body: ConsumePantryInput,
  ): Promise<ConsumeResult> {
    return this.pantry.consume(scope, body);
  }

  @Post("cook")
  @Scope("personal")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Cook a meal: deplete its ingredients and return refill suggestions",
  })
  cook(
    @CurrentScope() scope: ScopeContext,
    @Body(new ZodValidationPipe(cookMealSchema)) body: CookMealInput,
  ): Promise<CookResult> {
    return this.pantry.cook(scope, body);
  }
}
