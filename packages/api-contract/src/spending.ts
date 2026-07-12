import { z } from "zod";
import { dataScopeSchema } from "./scope.js";
import { objectIdSchema } from "./pantry.js";

/**
 * Currency is unified to VND across the whole product. Amounts are stored and
 * exchanged as INTEGER đồng (no minor unit, no decimals) — VND has no sub-unit
 * in practice — so there is never any floating-point rounding drift. Every money
 * field below is a non-negative integer number of đồng.
 */
export const currencySchema = z.literal("VND");
export type Currency = z.infer<typeof currencySchema>;

/** A non-negative whole number of đồng. */
export const moneySchema = z.number().int().min(0).max(1_000_000_000_000);

/** Spending categories. Kept as a small closed set for stable analytics. */
export const expenseCategorySchema = z.enum([
  "groceries",
  "dining",
  "household",
  "other",
]);
export type ExpenseCategory = z.infer<typeof expenseCategorySchema>;

/**
 * One line on an expense. `unitPrice` is SERVER-COMPUTED as `round(total /
 * quantity)` in whole đồng and feeds the price-history trend; callers send only
 * `quantity` and `total`.
 */
export const expenseItemInputSchema = z.object({
  name: z.string().min(1).max(200),
  quantity: z.number().positive().max(1_000_000),
  total: moneySchema,
});
export type ExpenseItemInput = z.infer<typeof expenseItemInputSchema>;

/** One line on an expense as stored/returned, including the derived `unitPrice`. */
export const expenseItemSchema = z.object({
  name: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
  total: z.number(),
});
export type ExpenseItem = z.infer<typeof expenseItemSchema>;

/** Full expense projection returned by the spending endpoints. */
export const expenseResponseSchema = z.object({
  id: z.string(),
  scope: dataScopeSchema,
  totalAmount: z.number(),
  currency: currencySchema,
  category: expenseCategorySchema,
  note: z.string().nullable(),
  /** ISO date the spend occurred. */
  date: z.string(),
  shoppingListId: z.string().nullable(),
  items: z.array(expenseItemSchema),
  version: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ExpenseResponse = z.infer<typeof expenseResponseSchema>;

/**
 * Log an expense. `totalAmount` is the whole-đồng total. When `items` are given,
 * each line's `unitPrice` is derived server-side. Creating an expense atomically
 * deducts the current budget's remaining amount.
 */
export const createExpenseSchema = z.object({
  totalAmount: moneySchema,
  category: expenseCategorySchema.default("groceries"),
  note: z.string().max(500).nullable().optional(),
  date: z.coerce.date().optional(),
  shoppingListId: objectIdSchema.nullable().optional(),
  items: z.array(expenseItemInputSchema).max(200).default([]),
});
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

/** List/filter query for expenses. Cursor-paginated. */
export const expenseQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
  category: expenseCategorySchema.optional(),
  /** Inclusive lower bound on the spend date (ISO). */
  from: z.coerce.date().optional(),
  /** Exclusive upper bound on the spend date (ISO). */
  to: z.coerce.date().optional(),
});
export type ExpenseQuery = z.infer<typeof expenseQuerySchema>;

/** Full budget projection returned by the spending endpoints. */
export const budgetResponseSchema = z.object({
  id: z.string(),
  scope: dataScopeSchema,
  amount: z.number(),
  spent: z.number(),
  /** Convenience: `amount - spent` (may be negative when overspent). */
  remaining: z.number(),
  currency: currencySchema,
  /** ISO start of the 30-day cycle. */
  cycleStart: z.string(),
  /** ISO end of the 30-day cycle (exclusive). */
  cycleEnd: z.string(),
  version: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type BudgetResponse = z.infer<typeof budgetResponseSchema>;

/**
 * Set the budget for a fresh 30-day cycle starting now. `spent` starts at zero
 * and accrues as expenses are logged within the cycle.
 */
export const createBudgetSchema = z.object({
  amount: moneySchema,
});
export type CreateBudgetInput = z.infer<typeof createBudgetSchema>;

/** Category totals plus the budget context for a period. */
export const spendingSummarySchema = z.object({
  currency: currencySchema,
  /** ISO inclusive lower bound of the summarized period. */
  from: z.string(),
  /** ISO exclusive upper bound of the summarized period. */
  to: z.string(),
  totalSpent: z.number(),
  expenseCount: z.number(),
  budgetAmount: z.number().nullable(),
  budgetRemaining: z.number().nullable(),
  byCategory: z.array(
    z.object({ category: expenseCategorySchema, total: z.number() }),
  ),
});
export type SpendingSummary = z.infer<typeof spendingSummarySchema>;

/** Time-bucketed spending series plus category totals for charts. */
export const spendingStatsSchema = z.object({
  currency: currencySchema,
  from: z.string(),
  to: z.string(),
  /** Bucket granularity of the `series` points. */
  interval: z.enum(["day", "month"]),
  series: z.array(
    z.object({
      /** ISO date at the start of the bucket. */
      period: z.string(),
      total: z.number(),
    }),
  ),
  byCategory: z.array(
    z.object({ category: expenseCategorySchema, total: z.number() }),
  ),
});
export type SpendingStats = z.infer<typeof spendingStatsSchema>;

/** Query for the summary/stats endpoints. Defaults to the current budget cycle. */
export const spendingRangeQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  interval: z.enum(["day", "month"]).default("day"),
});
export type SpendingRangeQuery = z.infer<typeof spendingRangeQuerySchema>;

/** One observed unit price for an item at a point in time. */
export const priceHistoryPointSchema = z.object({
  /** ISO date the price was observed. */
  date: z.string(),
  unitPrice: z.number(),
  quantity: z.number(),
});
export type PriceHistoryPoint = z.infer<typeof priceHistoryPointSchema>;

/** Unit-price trend for one item over time. */
export const priceHistoryItemSchema = z.object({
  name: z.string(),
  /** Most recent observed unit price. */
  latestPrice: z.number(),
  minPrice: z.number(),
  maxPrice: z.number(),
  /** Observations ordered most-recent first. */
  points: z.array(priceHistoryPointSchema),
});
export type PriceHistoryItem = z.infer<typeof priceHistoryItemSchema>;

export const priceHistoryResponseSchema = z.object({
  items: z.array(priceHistoryItemSchema),
});
export type PriceHistoryResponse = z.infer<typeof priceHistoryResponseSchema>;

/** Query the unit-price history, optionally narrowed to one item name. */
export const priceHistoryQuerySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  /** Max distinct items to return when no `name` filter is set. */
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type PriceHistoryQuery = z.infer<typeof priceHistoryQuerySchema>;
