import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { HouseholdModule } from "../household/household.module";
import { ChatSpendingEvents } from "../household/services/chat-spending-events";
import { PantryModule } from "../pantry/pantry.module";
import { RecipesModule } from "../recipes/recipes.module";
import { BudgetRepository } from "./repositories/budget.repository";
import { ExpenseRepository } from "./repositories/expense.repository";
import { ShoppingListRepository } from "./repositories/shopping-list.repository";
import { Budget, BudgetSchema } from "./schemas/budget.schema";
import { Expense, ExpenseSchema } from "./schemas/expense.schema";
import {
  ShoppingList,
  ShoppingListSchema,
} from "./schemas/shopping-list.schema";
import { ShoppingController } from "./shopping.controller";
import { ShoppingService } from "./services/shopping.service";
import { SpendingController } from "./spending.controller";
import { SpendingEvents } from "./services/spending-events";
import { SpendingService } from "./services/spending.service";

/**
 * Shopping & spending module. Shopping generates lists from meal plans (reusing
 * RecipesModule for plans/recipes and PantryModule for stock). Spending logs
 * expenses that atomically deduct budgets and exposes analytics. The
 * {@link SpendingEvents} chat-card / budget-alert seam is rebound to the live
 * {@link ChatSpendingEvents} from {@link HouseholdModule}, so a household-scoped
 * expense posts a chat card and fans out a budget alert.
 */
@Module({
  imports: [
    RecipesModule,
    PantryModule,
    HouseholdModule,
    MongooseModule.forFeature([
      { name: ShoppingList.name, schema: ShoppingListSchema },
      { name: Expense.name, schema: ExpenseSchema },
      { name: Budget.name, schema: BudgetSchema },
    ]),
  ],
  controllers: [ShoppingController, SpendingController],
  providers: [
    ShoppingService,
    SpendingService,
    // The spending service depends on the SpendingEvents seam; bind it to the
    // live household implementation so expense/budget cards actually post.
    { provide: SpendingEvents, useExisting: ChatSpendingEvents },
    ShoppingListRepository,
    ExpenseRepository,
    BudgetRepository,
  ],
})
export class ShoppingModule {}
