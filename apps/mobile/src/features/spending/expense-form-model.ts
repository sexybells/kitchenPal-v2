import type {
  CreateExpenseInput,
  ExpenseCategory,
} from "@kitchenpal/api-contract";
import type { ExpenseDraftItem } from "../shopping/expense-draft";
import { parseVndInput } from "../../lib/currency";

/** Full editable state of the Log Expense form. */
export interface ExpenseFormState {
  items: ExpenseDraftItem[];
  category: ExpenseCategory;
  note: string;
  date?: Date;
  shoppingListId?: string;
}

/** A blank draft line. */
export const emptyDraftItem = (): ExpenseDraftItem => ({
  name: "",
  quantity: 1,
  total: "",
});

/**
 * Sum the line totals in integer đồng. Prices are typed as free-form strings (may
 * carry grouping dots) so each is parsed through the shared VND parser — never a
 * float. Blank prices count as 0.
 */
export function computeItemsTotal(items: readonly ExpenseDraftItem[]): number {
  return items.reduce((sum, item) => sum + parseVndInput(item.total), 0);
}

/**
 * Build the `POST /expenses` payload from the form, or return `null` when it is
 * not yet valid to submit (no positive total). Only complete lines (a name and a
 * positive price) become expense items; the server derives each `unitPrice` from
 * `quantity` + `total`. `totalAmount` is the sum of those line totals, so the
 * budget deduction always matches the itemized spend.
 */
export function buildExpensePayload(
  state: ExpenseFormState,
): CreateExpenseInput | null {
  const lines = state.items
    .map((item) => ({
      name: item.name.trim(),
      quantity: item.quantity > 0 ? item.quantity : 1,
      total: parseVndInput(item.total),
    }))
    .filter((line) => line.name.length > 0 && line.total > 0);

  const totalAmount = lines.reduce((sum, line) => sum + line.total, 0);
  if (totalAmount <= 0) return null;

  return {
    totalAmount,
    category: state.category,
    note: state.note.trim() || null,
    date: state.date,
    shoppingListId: state.shoppingListId ?? null,
    items: lines,
  };
}
