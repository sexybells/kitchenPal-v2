import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
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
 * expenses that atomically deduct budgets and exposes analytics. {@link
 * SpendingEvents} is the no-op chat-card / budget-alert seam a later chat phase
 * overrides; it is exported so that module can rebind it.
 */
@Module({
  imports: [
    RecipesModule,
    PantryModule,
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
    SpendingEvents,
    ShoppingListRepository,
    ExpenseRepository,
    BudgetRepository,
  ],
  exports: [SpendingEvents],
})
export class ShoppingModule {}
