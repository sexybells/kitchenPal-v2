import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import type {
  CreateBudgetInput,
  CreateExpenseInput,
  ExpenseQuery,
  PriceHistoryQuery,
  SpendingRangeQuery,
} from "@kitchenpal/api-contract";
import { spendingApi } from "../../api/spending";
import { ApiClientError } from "../../api/errors";

/** Spending query keys — centralised so mutations invalidate consistently. */
export const spendingKeys = {
  all: ["spending"] as const,
  budget: ["spending", "budget"] as const,
  summary: (query?: Partial<SpendingRangeQuery>) =>
    ["spending", "summary", query ?? {}] as const,
  stats: (query?: Partial<SpendingRangeQuery>) =>
    ["spending", "stats", query ?? {}] as const,
  expenses: (query?: Partial<ExpenseQuery>) =>
    ["spending", "expenses", query ?? {}] as const,
  priceHistory: (query?: Partial<PriceHistoryQuery>) =>
    ["spending", "price-history", query ?? {}] as const,
};

/** Invalidate everything derived from expenses/budget after a write. */
const invalidateSpending = (client: QueryClient) =>
  client.invalidateQueries({ queryKey: spendingKeys.all });

/** True when the error is a "no active budget" 404 (a normal empty state). */
export const isNoBudgetError = (error: unknown): boolean =>
  error instanceof ApiClientError && error.status === 404;

/**
 * The active budget cycle. The backend 404s when none is set; that is the
 * "no budget yet" state, not an error, so it is not retried and callers check
 * `isNoBudgetError`.
 */
export const useCurrentBudget = () =>
  useQuery({
    queryKey: spendingKeys.budget,
    queryFn: () => spendingApi.currentBudget(),
    retry: (_failureCount, error) => !isNoBudgetError(error),
  });

export const useSpendingSummary = (query: Partial<SpendingRangeQuery> = {}) =>
  useQuery({
    queryKey: spendingKeys.summary(query),
    queryFn: () => spendingApi.summary(query),
  });

export const useSpendingStats = (query: Partial<SpendingRangeQuery> = {}) =>
  useQuery({
    queryKey: spendingKeys.stats(query),
    queryFn: () => spendingApi.stats(query),
  });

export const useExpenses = (query: Partial<ExpenseQuery> = {}) =>
  useQuery({
    queryKey: spendingKeys.expenses(query),
    queryFn: () => spendingApi.listExpenses(query),
  });

export const usePriceHistory = (query: Partial<PriceHistoryQuery> = {}) =>
  useQuery({
    queryKey: spendingKeys.priceHistory(query),
    queryFn: () => spendingApi.priceHistory(query),
  });

export const useCreateExpense = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateExpenseInput) => spendingApi.createExpense(input),
    onSuccess: () => invalidateSpending(client),
  });
};

export const useDeleteExpense = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => spendingApi.deleteExpense(id),
    onSuccess: () => invalidateSpending(client),
  });
};

export const useCreateBudget = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBudgetInput) => spendingApi.createBudget(input),
    onSuccess: () => invalidateSpending(client),
  });
};
