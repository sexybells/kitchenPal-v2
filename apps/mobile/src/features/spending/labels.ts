import type { TFunction } from "i18next";
import type { ExpenseCategory } from "@kitchenpal/api-contract";
import type { ColorToken } from "../../theme";
import type { IconName } from "../../ui";

/** The closed set of expense categories, in display order. */
export const EXPENSE_CATEGORIES: readonly ExpenseCategory[] = [
  "groceries",
  "dining",
  "household",
  "other",
] as const;

/** A distinct chart/accent color token per category (all valid theme tokens). */
const CATEGORY_COLOR: Record<ExpenseCategory, ColorToken> = {
  groceries: "primary",
  dining: "info",
  household: "secondary",
  other: "accent",
};

const CATEGORY_ICON: Record<ExpenseCategory, IconName> = {
  groceries: "shopping",
  dining: "meals",
  household: "household",
  other: "leaf",
};

export const categoryLabel = (t: TFunction, category: ExpenseCategory): string =>
  t(`spending.category.${category}`);

export const categoryColor = (category: ExpenseCategory): ColorToken =>
  CATEGORY_COLOR[category];

export const categoryIcon = (category: ExpenseCategory): IconName =>
  CATEGORY_ICON[category];
