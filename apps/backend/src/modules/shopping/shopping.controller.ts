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
  addNeededItemsSchema,
  addShoppingItemSchema,
  deleteShoppingItemSchema,
  generateShoppingSchema,
  objectIdSchema,
  updateShoppingItemSchema,
  type AddNeededItemsInput,
  type AddShoppingItemInput,
  type DeleteShoppingItemInput,
  type GenerateShoppingInput,
  type ShoppingListResponse,
  type UpdateShoppingItemInput,
} from "@kitchenpal/api-contract";
import {
  CurrentScope,
  HouseholdScope,
} from "../../common/scope/scope.decorator";
import type { ScopeContext } from "../../common/scope/scope-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { ShoppingService } from "./services/shopping.service";

/**
 * Shopping lists: generate from a meal plan, receive ad-hoc needed items from the
 * pantry-refill / recipe add-missing seams, read the current list, and
 * version-guarded item CRUD (including the `bought` toggle). Every route is
 * `@HouseholdScope()`. `current` is declared before `:id` so it is not captured
 * as an id.
 */
@ApiTags("shopping")
@ApiBearerAuth()
@Controller("shopping")
export class ShoppingController {
  constructor(private readonly shopping: ShoppingService) {}

  @Post("generate")
  @HouseholdScope()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Generate a shopping list from a meal plan" })
  generate(
    @CurrentScope() scope: ScopeContext,
    @Body(new ZodValidationPipe(generateShoppingSchema))
    body: GenerateShoppingInput,
  ): Promise<ShoppingListResponse> {
    return this.shopping.generate(scope, body);
  }

  @Post("needed-items")
  @HouseholdScope()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Add needed items to the current list (refill / add-missing seam)",
  })
  addNeededItems(
    @CurrentScope() scope: ScopeContext,
    @Body(new ZodValidationPipe(addNeededItemsSchema))
    body: AddNeededItemsInput,
  ): Promise<ShoppingListResponse> {
    return this.shopping.addNeededItems(scope, body);
  }

  @Get("current")
  @HouseholdScope()
  @ApiOperation({ summary: "Get the current shopping list in the active scope (personal or household)" })
  getCurrent(
    @CurrentScope() scope: ScopeContext,
  ): Promise<ShoppingListResponse> {
    return this.shopping.getCurrent(scope);
  }

  @Get(":id")
  @HouseholdScope()
  @ApiOperation({ summary: "Get a shopping list by id" })
  getById(
    @CurrentScope() scope: ScopeContext,
    @Param("id", new ZodValidationPipe(objectIdSchema)) id: string,
  ): Promise<ShoppingListResponse> {
    return this.shopping.getById(scope, id);
  }

  @Post(":id/items")
  @HouseholdScope()
  @ApiOperation({ summary: "Add an item to a list (versioned)" })
  addItem(
    @CurrentScope() scope: ScopeContext,
    @Param("id", new ZodValidationPipe(objectIdSchema)) id: string,
    @Body(new ZodValidationPipe(addShoppingItemSchema))
    body: AddShoppingItemInput,
  ): Promise<ShoppingListResponse> {
    return this.shopping.addItem(scope, id, body);
  }

  @Patch(":id/items/:itemId")
  @HouseholdScope()
  @ApiOperation({ summary: "Edit an item or toggle bought (versioned)" })
  updateItem(
    @CurrentScope() scope: ScopeContext,
    @Param("id", new ZodValidationPipe(objectIdSchema)) id: string,
    @Param("itemId") itemId: string,
    @Body(new ZodValidationPipe(updateShoppingItemSchema))
    body: UpdateShoppingItemInput,
  ): Promise<ShoppingListResponse> {
    return this.shopping.updateItem(scope, id, itemId, body);
  }

  @Delete(":id/items/:itemId")
  @HouseholdScope()
  @ApiOperation({ summary: "Remove an item from a list (versioned)" })
  deleteItem(
    @CurrentScope() scope: ScopeContext,
    @Param("id", new ZodValidationPipe(objectIdSchema)) id: string,
    @Param("itemId") itemId: string,
    @Query(new ZodValidationPipe(deleteShoppingItemSchema))
    query: DeleteShoppingItemInput,
  ): Promise<ShoppingListResponse> {
    return this.shopping.deleteItem(scope, id, itemId, query.expectedVersion);
  }
}
