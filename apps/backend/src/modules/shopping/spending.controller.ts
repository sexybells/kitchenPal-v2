import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  createBudgetSchema,
  createExpenseSchema,
  expenseQuerySchema,
  objectIdSchema,
  priceHistoryQuerySchema,
  spendingRangeQuerySchema,
  type BudgetResponse,
  type CreateBudgetInput,
  type CreateExpenseInput,
  type ExpenseQuery,
  type ExpenseResponse,
  type PriceHistoryQuery,
  type PriceHistoryResponse,
  type SpendingRangeQuery,
  type SpendingStats,
  type SpendingSummary,
} from "@kitchenpal/api-contract";
import type { PageResult } from "../../common/http/page-result";
import {
  CurrentScope,
  HouseholdScope,
} from "../../common/scope/scope.decorator";
import type { ScopeContext } from "../../common/scope/scope-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { SpendingService } from "./services/spending.service";

/**
 * Spending: expenses (logging auto-computes each item's unit price and deducts
 * the active budget), budgets (30-day cycles), and analytics (summary, stats,
 * price-history). Every route is `@HouseholdScope()`. All money is VND (integer
 * đồng).
 */
@ApiTags("spending")
@ApiBearerAuth()
@Controller()
export class SpendingController {
  constructor(private readonly spending: SpendingService) {}

  @Post("expenses")
  @HouseholdScope()
  @ApiOperation({ summary: "Log an expense (deducts the active budget)" })
  createExpense(
    @CurrentScope() scope: ScopeContext,
    @Body(new ZodValidationPipe(createExpenseSchema)) body: CreateExpenseInput,
  ): Promise<ExpenseResponse> {
    return this.spending.createExpense(scope, body);
  }

  @Get("expenses")
  @HouseholdScope()
  @ApiOperation({ summary: "List expenses (filter by category / date range)" })
  listExpenses(
    @CurrentScope() scope: ScopeContext,
    @Query(new ZodValidationPipe(expenseQuerySchema)) query: ExpenseQuery,
  ): Promise<PageResult<ExpenseResponse>> {
    return this.spending.listExpenses(scope, query);
  }

  @Delete("expenses/:id")
  @HouseholdScope()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Delete an expense (refunds the budget)" })
  async deleteExpense(
    @CurrentScope() scope: ScopeContext,
    @Param("id", new ZodValidationPipe(objectIdSchema)) id: string,
  ): Promise<{ deleted: boolean }> {
    await this.spending.deleteExpense(scope, id);
    return { deleted: true };
  }

  @Post("budgets")
  @HouseholdScope()
  @ApiOperation({ summary: "Set the budget for a new 30-day cycle" })
  createBudget(
    @CurrentScope() scope: ScopeContext,
    @Body(new ZodValidationPipe(createBudgetSchema)) body: CreateBudgetInput,
  ): Promise<BudgetResponse> {
    return this.spending.createBudget(scope, body);
  }

  @Get("budgets/current")
  @HouseholdScope()
  @ApiOperation({ summary: "Get the active budget cycle" })
  getCurrentBudget(
    @CurrentScope() scope: ScopeContext,
  ): Promise<BudgetResponse> {
    return this.spending.getCurrentBudget(scope);
  }

  @Get("spending/summary")
  @HouseholdScope()
  @ApiOperation({ summary: "Category totals + budget context for a period" })
  getSummary(
    @CurrentScope() scope: ScopeContext,
    @Query(new ZodValidationPipe(spendingRangeQuerySchema))
    query: SpendingRangeQuery,
  ): Promise<SpendingSummary> {
    return this.spending.getSummary(scope, query);
  }

  @Get("spending/stats")
  @HouseholdScope()
  @ApiOperation({ summary: "Time-bucketed spending series for charts" })
  getStats(
    @CurrentScope() scope: ScopeContext,
    @Query(new ZodValidationPipe(spendingRangeQuerySchema))
    query: SpendingRangeQuery,
  ): Promise<SpendingStats> {
    return this.spending.getStats(scope, query);
  }

  @Get("spending/price-history")
  @HouseholdScope()
  @ApiOperation({ summary: "Unit-price trend per item over time" })
  getPriceHistory(
    @CurrentScope() scope: ScopeContext,
    @Query(new ZodValidationPipe(priceHistoryQuerySchema))
    query: PriceHistoryQuery,
  ): Promise<PriceHistoryResponse> {
    return this.spending.getPriceHistory(scope, query);
  }
}
