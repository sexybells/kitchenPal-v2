import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { FilterQuery, HydratedDocument } from "mongoose";
import { Model } from "mongoose";
import { ScopedRepository } from "../../../common/database/base.repository";
import type { ScopedDocumentFields } from "../../../common/database/base.schema";
import { scopeFilterFor } from "../../../common/database/scope-filter";
import type { ScopeContext } from "../../../common/scope/scope-context";
import { ShoppingList } from "../schemas/shopping-list.schema";

export type ShoppingListEntity = ShoppingList & ScopedDocumentFields;

type ShoppingListDoc = HydratedDocument<ShoppingListEntity>;

/** Scope-partitioned store for shopping lists. */
@Injectable()
export class ShoppingListRepository extends ScopedRepository<ShoppingListEntity> {
  constructor(@InjectModel(ShoppingList.name) model: Model<ShoppingListEntity>) {
    super(model);
  }

  /** The caller's live list generated from a specific meal plan, if any. */
  findByMealPlanId(
    scope: ScopeContext,
    mealPlanId: string,
  ): Promise<ShoppingListDoc | null> {
    return this.findOne(scope, {
      mealPlanId,
    } as FilterQuery<ShoppingListEntity>);
  }

  /** The caller's most recently updated list, if any (the "current" list). */
  findCurrent(scope: ScopeContext): Promise<ShoppingListDoc | null> {
    return this.model
      .findOne({
        ...scopeFilterFor<ShoppingListEntity>(scope),
        deletedAt: null,
      } as FilterQuery<ShoppingListEntity>)
      .sort({ updatedAt: -1, _id: -1 })
      .exec();
  }
}
