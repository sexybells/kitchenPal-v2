import { Injectable } from "@nestjs/common";
import { AppLogger } from "../../../common/logging/app-logger.service";
import {
  ExpenseLoggedEvent,
  SpendingEvents,
} from "../../shopping/services/spending-events";
import { HouseholdMemberRepository } from "../repositories/household-member.repository";
import { ChatService } from "./chat.service";
import { NotificationService } from "./notification.service";

/**
 * Live implementation of the spending seam (a no-op by default). When a member
 * logs an expense in HOUSEHOLD scope, this posts an `expense` card to the
 * household chat and, if the budget cycle went over, a `budget_alert` card plus a
 * notification fan-out to every active member. Personal-scope expenses have no
 * household to post into and are ignored. Runs after the expense transaction has
 * committed, and never throws back into the spending flow.
 */
@Injectable()
export class ChatSpendingEvents extends SpendingEvents {
  constructor(
    private readonly chat: ChatService,
    private readonly notifications: NotificationService,
    private readonly members: HouseholdMemberRepository,
    private readonly logger: AppLogger,
  ) {
    super();
  }

  override async expenseLogged(event: ExpenseLoggedEvent): Promise<void> {
    const { scope } = event;
    if (scope.scope !== "household" || !scope.householdId) {
      return;
    }
    const householdId = scope.householdId;
    try {
      const amount = formatVnd(event.expense.totalAmount);
      await this.chat.postCard(householdId, {
        type: "expense",
        text: `Logged ${amount} on ${event.expense.category}`,
        senderId: scope.userId,
        expenseId: event.expense.id,
      });

      if (event.overBudget && event.budget) {
        const spent = formatVnd(event.budget.spent);
        const limit = formatVnd(event.budget.amount);
        await this.chat.postCard(householdId, {
          type: "budget_alert",
          text: `Budget exceeded: ${spent} of ${limit} spent this cycle`,
          senderId: scope.userId,
        });
        const memberIds = await this.members.activeMemberIds(householdId);
        await this.notifications.notifyMany(memberIds, {
          type: "budget_alert",
          payload: {
            householdId,
            budgetId: event.budget.id,
            spent: event.budget.spent,
            amount: event.budget.amount,
          },
          delivery: {
            push: {
              title: "Budget exceeded",
              body: `${spent} of ${limit} spent this cycle`,
            },
            email: {
              subject: "KitchenPal budget alert",
              text: `Your household budget cycle is over its limit: ${spent} of ${limit} spent.`,
            },
          },
        });
      }
    } catch (error) {
      // A chat/notification failure must never roll back the logged expense.
      this.logger.error(
        `Failed to post spending card for household ${householdId}: ${(error as Error).message}`,
        (error as Error).stack,
        "ChatSpendingEvents",
      );
    }
  }
}

/** Formats whole đồng with thousands separators, e.g. 200000 → "200.000 đ". */
function formatVnd(amount: number): string {
  return `${amount.toLocaleString("vi-VN")} đ`;
}
