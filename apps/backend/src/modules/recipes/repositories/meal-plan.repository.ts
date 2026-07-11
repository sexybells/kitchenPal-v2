import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { FilterQuery, HydratedDocument } from "mongoose";
import { Model } from "mongoose";
import { ScopedRepository } from "../../../common/database/base.repository";
import type { ScopedDocumentFields } from "../../../common/database/base.schema";
import type { ScopeContext } from "../../../common/scope/scope-context";
import { MealPlan } from "../schemas/meal-plan.schema";

export type MealPlanEntity = MealPlan & ScopedDocumentFields;

type MealPlanDoc = HydratedDocument<MealPlanEntity>;

/** Scope-partitioned store for weekly meal plans. */
@Injectable()
export class MealPlanRepository extends ScopedRepository<MealPlanEntity> {
  constructor(@InjectModel(MealPlan.name) model: Model<MealPlanEntity>) {
    super(model);
  }

  /** The caller's plan for an exact week start, if one exists. */
  findByWeekStart(
    scope: ScopeContext,
    weekStart: Date,
  ): Promise<MealPlanDoc | null> {
    return this.findOne(scope, {
      weekStart,
    } as FilterQuery<MealPlanEntity>);
  }

  /** The caller's plan with the latest week start, if any. */
  async findLatest(scope: ScopeContext): Promise<MealPlanDoc | null> {
    const all = await this.find(scope);
    return (
      all.sort((a, b) => b.weekStart.getTime() - a.weekStart.getTime())[0] ??
      null
    );
  }
}
