import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { FilterQuery, HydratedDocument } from "mongoose";
import { Model } from "mongoose";
import { ScopedRepository } from "../../../common/database/base.repository";
import type { ScopedDocumentFields } from "../../../common/database/base.schema";
import type { ScopeContext } from "../../../common/scope/scope-context";
import { RecipeFavorite } from "../schemas/recipe-favorite.schema";

export type RecipeFavoriteEntity = RecipeFavorite & ScopedDocumentFields;

type FavoriteDoc = HydratedDocument<RecipeFavoriteEntity>;

/** Scope-partitioned store for a user's recipe favorites. */
@Injectable()
export class RecipeFavoriteRepository extends ScopedRepository<RecipeFavoriteEntity> {
  constructor(
    @InjectModel(RecipeFavorite.name) model: Model<RecipeFavoriteEntity>,
  ) {
    super(model);
  }

  findByRecipe(
    scope: ScopeContext,
    recipeId: string,
  ): Promise<FavoriteDoc | null> {
    return this.findOne(scope, {
      recipeId,
    } as FilterQuery<RecipeFavoriteEntity>);
  }

  /** The caller's favorites, newest first. */
  listForOwner(scope: ScopeContext): Promise<FavoriteDoc[]> {
    return this.find(scope, {} as FilterQuery<RecipeFavoriteEntity>);
  }
}
