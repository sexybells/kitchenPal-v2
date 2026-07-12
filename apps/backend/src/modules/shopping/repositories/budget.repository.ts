import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { ClientSession, FilterQuery, HydratedDocument } from "mongoose";
import { Model } from "mongoose";
import { ScopedRepository } from "../../../common/database/base.repository";
import type { ScopedDocumentFields } from "../../../common/database/base.schema";
import { scopeFilterFor } from "../../../common/database/scope-filter";
import type { ScopeContext } from "../../../common/scope/scope-context";
import { Budget } from "../schemas/budget.schema";

export type BudgetEntity = Budget & ScopedDocumentFields;

type BudgetDoc = HydratedDocument<BudgetEntity>;

/** Scope-partitioned store for spending budgets. */
@Injectable()
export class BudgetRepository extends ScopedRepository<BudgetEntity> {
  constructor(@InjectModel(Budget.name) model: Model<BudgetEntity>) {
    super(model);
  }

  /** The budget whose 30-day cycle contains `at` (cycleStart ≤ at < cycleEnd). */
  findActiveAt(
    scope: ScopeContext,
    at: Date,
    session?: ClientSession,
  ): Promise<BudgetDoc | null> {
    return this.findOne(
      scope,
      {
        cycleStart: { $lte: at },
        cycleEnd: { $gt: at },
      } as FilterQuery<BudgetEntity>,
      session,
    );
  }

  /**
   * Any live budget whose cycle overlaps the half-open window `[start, end)`.
   * Two ranges overlap when each starts before the other ends. Used to reject
   * creating a second budget that would cover the same days, which would make the
   * "active" budget ambiguous.
   */
  findOverlapping(
    scope: ScopeContext,
    start: Date,
    end: Date,
  ): Promise<BudgetDoc | null> {
    return this.findOne(scope, {
      cycleStart: { $lt: end },
      cycleEnd: { $gt: start },
    } as FilterQuery<BudgetEntity>);
  }

  /**
   * Atomically adjusts a budget's `spent` by `delta` (positive to charge, negative
   * to refund) via a single `$inc`, so the read-modify-write is done in the
   * database, not in app memory — `spent` can never be computed from a stale copy.
   * Two expenses against the same budget run inside their own transactions and
   * serialize on this document via write-conflict retries (see the caller's
   * `withTransaction`); either ordering applies both increments, so no update is
   * ever lost. It is intentionally NOT version-guarded: a version guard would fail
   * one writer with a false conflict instead of letting both increments land.
   */
  async incrementSpent(
    scope: ScopeContext,
    id: string,
    delta: number,
    session: ClientSession,
  ): Promise<void> {
    await this.model
      .updateOne(
        {
          ...scopeFilterFor<BudgetEntity>(scope),
          _id: id,
          deletedAt: null,
        } as FilterQuery<BudgetEntity>,
        { $inc: { spent: delta } },
        { session },
      )
      .exec();
  }
}
