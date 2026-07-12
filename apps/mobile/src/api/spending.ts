import { z } from "zod";
import {
  budgetResponseSchema,
  expenseResponseSchema,
  priceHistoryResponseSchema,
  spendingStatsSchema,
  spendingSummarySchema,
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
import { api } from "./api";

/** The list endpoint returns `data: Expense[]` inside the paginated envelope. */
const expenseListSchema = z.array(expenseResponseSchema);

/** Serialise the expense list filter into a `?a=b` string, skipping empties. */
const toExpenseQuery = (query: Partial<ExpenseQuery>): string => {
  const params = new URLSearchParams();
  if (query.category) params.set("category", query.category);
  if (query.limit) params.set("limit", String(query.limit));
  if (query.cursor) params.set("cursor", query.cursor);
  if (query.from) params.set("from", new Date(query.from).toISOString());
  if (query.to) params.set("to", new Date(query.to).toISOString());
  const qs = params.toString();
  return qs ? `?${qs}` : "";
};

/** Serialise the summary/stats range query. */
const toRangeQuery = (query: Partial<SpendingRangeQuery>): string => {
  const params = new URLSearchParams();
  if (query.from) params.set("from", new Date(query.from).toISOString());
  if (query.to) params.set("to", new Date(query.to).toISOString());
  if (query.interval) params.set("interval", query.interval);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
};

/**
 * Spending (expenses + budgets + analytics) endpoint wrappers. Money is integer
 * đồng throughout; `unitPrice` on each expense line is server-derived. All routes
 * are personal-scoped and require the access token.
 */
export const spendingApi = {
  listExpenses: (query: Partial<ExpenseQuery> = {}): Promise<ExpenseResponse[]> =>
    api.request(`expenses${toExpenseQuery(query)}`, {
      method: "GET",
      auth: true,
      schema: expenseListSchema,
    }),

  createExpense: (input: CreateExpenseInput): Promise<ExpenseResponse> =>
    api.request("expenses", {
      // `date` is an optional Date in the input; serialise to ISO for transport.
      body: input.date ? { ...input, date: new Date(input.date).toISOString() } : input,
      auth: true,
      schema: expenseResponseSchema,
    }),

  deleteExpense: (id: string): Promise<void> =>
    api
      .request(`expenses/${id}`, { method: "DELETE", auth: true })
      .then(() => undefined),

  currentBudget: (): Promise<BudgetResponse> =>
    api.request("budgets/current", {
      method: "GET",
      auth: true,
      schema: budgetResponseSchema,
    }),

  createBudget: (input: CreateBudgetInput): Promise<BudgetResponse> =>
    api.request("budgets", {
      body: input,
      auth: true,
      schema: budgetResponseSchema,
    }),

  summary: (query: Partial<SpendingRangeQuery> = {}): Promise<SpendingSummary> =>
    api.request(`spending/summary${toRangeQuery(query)}`, {
      method: "GET",
      auth: true,
      schema: spendingSummarySchema,
    }),

  stats: (query: Partial<SpendingRangeQuery> = {}): Promise<SpendingStats> =>
    api.request(`spending/stats${toRangeQuery(query)}`, {
      method: "GET",
      auth: true,
      schema: spendingStatsSchema,
    }),

  priceHistory: (
    query: Partial<PriceHistoryQuery> = {},
  ): Promise<PriceHistoryResponse> => {
    const params = new URLSearchParams();
    if (query.name) params.set("name", query.name);
    if (query.limit) params.set("limit", String(query.limit));
    const qs = params.toString();
    return api.request(`spending/price-history${qs ? `?${qs}` : ""}`, {
      method: "GET",
      auth: true,
      schema: priceHistoryResponseSchema,
    });
  },
};
