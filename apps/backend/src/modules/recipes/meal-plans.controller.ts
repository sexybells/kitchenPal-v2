import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  autoFillSchema,
  createMealPlanSchema,
  objectIdSchema,
  updateSlotSchema,
  type AutoFillInput,
  type AutoFillResponse,
  type CreateMealPlanInput,
  type MealPlanResponse,
  type UpdateSlotInput,
} from "@kitchenpal/api-contract";
import {
  CurrentScope,
  HouseholdScope,
} from "../../common/scope/scope.decorator";
import type { ScopeContext } from "../../common/scope/scope-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { MealPlansService } from "./services/meal-plans.service";

/**
 * Weekly meal plans: create, read the current week, atomic version-guarded slot
 * edits, AI auto-fill, and clear. Every route is `@HouseholdScope()`, so a
 * household shares one plan per week while a solo user keeps their own. `current`
 * is declared before `:id` so it is not captured as an id.
 */
@ApiTags("meal-plans")
@ApiBearerAuth()
@Controller("meal-plans")
export class MealPlansController {
  constructor(private readonly plans: MealPlansService) {}

  @Post()
  @HouseholdScope()
  @ApiOperation({ summary: "Create a weekly meal plan with empty slots" })
  create(
    @CurrentScope() scope: ScopeContext,
    @Body(new ZodValidationPipe(createMealPlanSchema)) body: CreateMealPlanInput,
  ): Promise<MealPlanResponse> {
    return this.plans.create(scope, body);
  }

  @Get("current")
  @HouseholdScope()
  @ApiOperation({ summary: "Get the plan for the current week (or the latest)" })
  getCurrent(
    @CurrentScope() scope: ScopeContext,
  ): Promise<MealPlanResponse> {
    return this.plans.getCurrent(scope);
  }

  @Get(":id")
  @HouseholdScope()
  @ApiOperation({ summary: "Get a meal plan by id" })
  getById(
    @CurrentScope() scope: ScopeContext,
    @Param("id", new ZodValidationPipe(objectIdSchema)) id: string,
  ): Promise<MealPlanResponse> {
    return this.plans.getById(scope, id);
  }

  @Patch(":id/slots/:slotId")
  @HouseholdScope()
  @ApiOperation({ summary: "Assign or clear the recipe in one slot (versioned)" })
  updateSlot(
    @CurrentScope() scope: ScopeContext,
    @Param("id", new ZodValidationPipe(objectIdSchema)) id: string,
    @Param("slotId") slotId: string,
    @Body(new ZodValidationPipe(updateSlotSchema)) body: UpdateSlotInput,
  ): Promise<MealPlanResponse> {
    return this.plans.updateSlot(scope, id, slotId, body);
  }

  @Post(":id/auto-fill")
  @HouseholdScope()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Auto-fill empty slots from existing recipes (diet + pantry aware)",
  })
  autoFill(
    @CurrentScope() scope: ScopeContext,
    @Param("id", new ZodValidationPipe(objectIdSchema)) id: string,
    @Body(new ZodValidationPipe(autoFillSchema)) body: AutoFillInput,
  ): Promise<AutoFillResponse> {
    return this.plans.autoFill(scope, id, body);
  }

  @Post(":id/clear")
  @HouseholdScope()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Clear every slot in a plan" })
  clear(
    @CurrentScope() scope: ScopeContext,
    @Param("id", new ZodValidationPipe(objectIdSchema)) id: string,
  ): Promise<MealPlanResponse> {
    return this.plans.clear(scope, id);
  }
}
