import { Injectable } from "@nestjs/common";
import type { BudgetResponse, ExpenseResponse } from "@kitchenpal/api-contract";
import type { ScopeContext } from "../../../common/scope/scope-context";

/** Payload handed to the spending-events seam when an expense is logged. */
export interface ExpenseLoggedEvent {
  scope: ScopeContext;
  expense: ExpenseResponse;
  /** The budget the expense deducted, or null when none was active. */
  budget: BudgetResponse | null;
  /** True when the deduction pushed the budget's `spent` at/over its `amount`. */
  overBudget: boolean;
}

/**
 * Integration seam for spending side effects — a household chat card summarizing
 * the expense and a budget-alert when a cycle is overspent. This default
 * implementation is a deliberate NO-OP: the household chat module (a later phase)
 * provides a real implementation that posts the card and alert. Keeping the seam
 * here lets the spending service fire the event unconditionally without knowing
 * whether chat exists yet, and without a hard dependency on the chat module.
 *
 * Handlers run AFTER the expense/budget transaction commits, so a chat failure
 * can never roll back a logged expense.
 */
@Injectable()
export class SpendingEvents {
  async expenseLogged(_event: ExpenseLoggedEvent): Promise<void> {
    // No-op until the chat module overrides this provider.
  }
}
