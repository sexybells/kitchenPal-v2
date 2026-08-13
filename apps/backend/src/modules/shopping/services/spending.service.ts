import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import type {
  BudgetResponse,
  CreateBudgetInput,
  CreateExpenseInput,
  ExpenseQuery,
  ExpenseResponse,
  PriceHistoryQuery,
  PriceHistoryResponse,
  SpendingRangeQuery,
  SpendingStats,
  SpendingSummary,
} from "@kitchenpal/api-contract";
import type { ClientSession, Connection, HydratedDocument } from "mongoose";
import { isDuplicateKeyError } from "../../../common/database/mongo-errors";
import { ErrorCode } from "../../../common/http/error-codes";
import { PageResult, paginate } from "../../../common/http/page-result";
import type { ScopeContext } from "../../../common/scope/scope-context";
import {
  BudgetRepository,
  type BudgetEntity,
} from "../repositories/budget.repository";
import {
  ExpenseRepository,
  type AnalyticsRange,
  type ExpenseEntity,
} from "../repositories/expense.repository";
import { Expense, ExpenseItem } from "../schemas/expense.schema";
import { priceExpenseItems } from "./expense-pricing";
import { SpendingEvents } from "./spending-events";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const CYCLE_DAYS = 30;

type ExpenseDoc = HydratedDocument<ExpenseEntity>;
type BudgetDoc = HydratedDocument<BudgetEntity>;

/**
 * Expenses and budgets with VND (integer đồng) money. Logging an expense
 * atomically deducts the active budget's `spent`; deleting one refunds it. The
 * expense insert and budget `$inc` share a transaction so they cannot drift, and
 * the `$inc` counter means concurrent expenses never lose an update. Analytics
 * (summary / stats / price-history) run as scope-filtered aggregations.
 */
@Injectable()
export class SpendingService {
  constructor(
    private readonly expenses: ExpenseRepository,
    private readonly budgets: BudgetRepository,
    private readonly events: SpendingEvents,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async createExpense(
    scope: ScopeContext,
    input: CreateExpenseInput,
  ): Promise<ExpenseResponse> {
    const date = input.date ?? new Date();
    const priced = priceExpenseItems(input.items);

    const { expense, chargedBudgetId } = await this.inTransaction(
      async (session) => {
        // The expense is charged to the budget whose cycle covers its date.
        const budget = await this.budgets.findActiveAt(scope, date, session);
        const created = await this.expenses.create(
          scope,
          {
            totalAmount: input.totalAmount,
            currency: "VND",
            category: input.category,
            note: input.note ?? null,
            date,
            shoppingListId: input.shoppingListId ?? null,
            budgetId: budget ? budget.id : null,
            items: priced as unknown as ExpenseItem[],
          } as Partial<ExpenseEntity>,
          session,
        );
        if (budget) {
          await this.budgets.incrementSpent(
            scope,
            budget.id,
            input.totalAmount,
            session,
          );
        }
        return { expense: created, chargedBudgetId: budget?.id ?? null };
      },
    );

    // Fire the chat-card / budget-alert seam AFTER commit so a handler failure
    // (once the chat module wires in) can never roll back a logged expense.
    const budget = chargedBudgetId
      ? await this.budgets.findById(scope, chargedBudgetId)
      : null;
    await this.events.expenseLogged({
      scope,
      expense: toExpenseResponse(expense),
      budget: budget ? toBudgetResponse(budget) : null,
      overBudget: budget ? budget.spent >= budget.amount : false,
    });

    return toExpenseResponse(expense);
  }

  async listExpenses(
    scope: ScopeContext,
    query: ExpenseQuery,
  ): Promise<PageResult<ExpenseResponse>> {
    const skip = decodeCursor(query.cursor);
    const { items, total } = await this.expenses.list(scope, {
      category: query.category,
      from: query.from,
      to: query.to,
      skip,
      limit: query.limit,
    });
    const nextSkip = skip + items.length;
    const hasMore = nextSkip < total;
    return paginate(items.map(toExpenseResponse), {
      nextCursor: hasMore ? encodeCursor(nextSkip) : null,
      total,
    });
  }

  async deleteExpense(scope: ScopeContext, id: string): Promise<void> {
    await this.inTransaction(async (session) => {
      const expense = await this.expenses.findById(scope, id, session);
      if (!expense) {
        throw new NotFoundException({
          code: ErrorCode.NOT_FOUND,
          message: "Expense not found",
          details: { id },
        });
      }
      const removed = await this.expenses.softDelete(scope, id, session);
      if (!removed) {
        // The read proved liveness, but guard the refund on the delete actually
        // matching so a future refactor can never refund without deleting.
        throw new NotFoundException({
          code: ErrorCode.NOT_FOUND,
          message: "Expense not found",
          details: { id },
        });
      }
      if (expense.budgetId) {
        // Refund the exact budget this expense charged, so `spent` stays honest.
        await this.budgets.incrementSpent(
          scope,
          expense.budgetId.toString(),
          -expense.totalAmount,
          session,
        );
      }
    });
  }

  async createBudget(
    scope: ScopeContext,
    input: CreateBudgetInput,
  ): Promise<BudgetResponse> {
    const cycleStart = startOfDayUtc(new Date());
    const cycleEnd = new Date(cycleStart.getTime() + CYCLE_DAYS * MS_PER_DAY);
    // Reject a second budget covering the same days: overlapping cycles would
    // make "the active budget" ambiguous for charging and current-budget reads.
    const overlap = await this.budgets.findOverlapping(
      scope,
      cycleStart,
      cycleEnd,
    );
    if (overlap) {
      throw this.budgetOverlapConflict(overlap.cycleStart, overlap.cycleEnd);
    }
    try {
      const created = await this.budgets.create(scope, {
        amount: input.amount,
        spent: 0,
        currency: "VND",
        cycleStart,
        cycleEnd,
      } as Partial<BudgetEntity>);
      return toBudgetResponse(created);
    } catch (error) {
      // A concurrent create for the same cycle won the unique-index race — the
      // findOverlapping pre-check above cannot catch a not-yet-committed sibling.
      // Surface the same 409 the pre-check would have.
      if (isDuplicateKeyError(error)) {
        throw this.budgetOverlapConflict(cycleStart, cycleEnd);
      }
      throw error;
    }
  }

  /** The 409 raised when a budget already covers the requested cycle. */
  private budgetOverlapConflict(
    cycleStart: Date,
    cycleEnd: Date,
  ): ConflictException {
    return new ConflictException({
      code: ErrorCode.CONFLICT,
      message:
        "An active budget already covers this period. Wait for the current cycle to end before setting a new one.",
      details: {
        cycleStart: cycleStart.toISOString(),
        cycleEnd: cycleEnd.toISOString(),
      },
    });
  }

  async getCurrentBudget(scope: ScopeContext): Promise<BudgetResponse> {
    const budget = await this.budgets.findActiveAt(scope, new Date());
    if (!budget) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: "No active budget found",
      });
    }
    return toBudgetResponse(budget);
  }

  async getSummary(
    scope: ScopeContext,
    query: SpendingRangeQuery,
  ): Promise<SpendingSummary> {
    const range = await this.resolveRange(scope, query);
    const [{ total, count }, byCategory, budget] = await Promise.all([
      this.expenses.totals(scope, range),
      this.expenses.totalsByCategory(scope, range),
      // Report the budget cycle that covers the summarized window, not "now", so
      // `budgetRemaining` stays consistent with `from`/`to` for a past range.
      this.budgets.findActiveAt(scope, range.from),
    ]);
    return {
      currency: "VND",
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      totalSpent: total,
      expenseCount: count,
      budgetAmount: budget ? budget.amount : null,
      budgetRemaining: budget ? budget.amount - budget.spent : null,
      byCategory,
    };
  }

  async getStats(
    scope: ScopeContext,
    query: SpendingRangeQuery,
  ): Promise<SpendingStats> {
    const range = await this.resolveRange(scope, query);
    const [series, byCategory] = await Promise.all([
      this.expenses.totalsByPeriod(scope, range, query.interval),
      this.expenses.totalsByCategory(scope, range),
    ]);
    return {
      currency: "VND",
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      interval: query.interval,
      series,
      byCategory,
    };
  }

  async getPriceHistory(
    scope: ScopeContext,
    query: PriceHistoryQuery,
  ): Promise<PriceHistoryResponse> {
    const rows = await this.expenses.priceHistory(scope, {
      name: query.name,
      limit: query.limit,
    });
    return {
      items: rows.map((row) => ({
        name: row.name,
        latestPrice: row.latestPrice,
        minPrice: row.minPrice,
        maxPrice: row.maxPrice,
        points: row.points.map((point) => ({
          date: point.date.toISOString(),
          unitPrice: point.unitPrice,
          quantity: point.quantity,
        })),
      })),
    };
  }

  /**
   * Resolves the analytics window: explicit `from`/`to` win; otherwise it
   * defaults to the active budget cycle, falling back to the last 30 days when no
   * budget is set. `to` is exclusive.
   */
  private async resolveRange(
    scope: ScopeContext,
    query: SpendingRangeQuery,
  ): Promise<AnalyticsRange> {
    if (query.from || query.to) {
      const to = query.to ?? new Date();
      const from =
        query.from ?? new Date(to.getTime() - CYCLE_DAYS * MS_PER_DAY);
      return { from, to };
    }
    const budget = await this.budgets.findActiveAt(scope, new Date());
    if (budget) {
      return { from: budget.cycleStart, to: budget.cycleEnd };
    }
    const now = new Date();
    return { from: new Date(now.getTime() - CYCLE_DAYS * MS_PER_DAY), to: now };
  }

  /**
   * Runs `work` in a MongoDB transaction; a write conflict retries the callback.
   * REQUIRES a replica-set deployment (MongoDB Atlas, or a self-managed RS — a
   * single-node RS is enough). On a STANDALONE mongod every expense create/delete
   * throws "Transaction numbers are only allowed on a replica set member or
   * mongos"; see `MONGODB_URI` in `.env.example`.
   */
  private async inTransaction<T>(
    work: (session: ClientSession) => Promise<T>,
  ): Promise<T> {
    const session = await this.connection.startSession();
    try {
      let result!: T;
      await session.withTransaction(async () => {
        result = await work(session);
      });
      return result;
    } finally {
      await session.endSession();
    }
  }
}

function toExpenseResponse(doc: ExpenseDoc): ExpenseResponse {
  const expense = doc as ExpenseDoc & Expense;
  return {
    id: doc.id,
    scope: doc.scope,
    totalAmount: expense.totalAmount,
    currency: expense.currency,
    category: expense.category,
    note: expense.note ?? null,
    date: expense.date.toISOString(),
    shoppingListId: expense.shoppingListId?.toString() ?? null,
    items: expense.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      total: item.total,
    })),
    version: doc.version,
    createdAt: (doc.createdAt ?? new Date()).toISOString(),
    updatedAt: (doc.updatedAt ?? new Date()).toISOString(),
  };
}

function toBudgetResponse(doc: BudgetDoc): BudgetResponse {
  return {
    id: doc.id,
    scope: doc.scope,
    amount: doc.amount,
    spent: doc.spent,
    remaining: doc.amount - doc.spent,
    currency: doc.currency,
    cycleStart: doc.cycleStart.toISOString(),
    cycleEnd: doc.cycleEnd.toISOString(),
    version: doc.version,
    createdAt: (doc.createdAt ?? new Date()).toISOString(),
    updatedAt: (doc.updatedAt ?? new Date()).toISOString(),
  };
}

/** UTC start-of-day for the given date. */
function startOfDayUtc(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

/** Cursor is an opaque base64 of the numeric offset. */
function encodeCursor(offset: number): string {
  return Buffer.from(String(offset), "utf8").toString("base64url");
}

function decodeCursor(cursor: string | undefined): number {
  if (!cursor) {
    return 0;
  }
  const decoded = Number.parseInt(
    Buffer.from(cursor, "base64url").toString("utf8"),
    10,
  );
  return Number.isFinite(decoded) && decoded >= 0 ? decoded : 0;
}
