import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { HydratedDocument } from "mongoose";
import { Model } from "mongoose";
import { ScopedRepository } from "../../../common/database/base.repository";
import type { ScopedDocumentFields } from "../../../common/database/base.schema";
import type { ScopeContext } from "../../../common/scope/scope-context";
import { RecipePreference } from "../schemas/recipe-preference.schema";

export type RecipePreferenceEntity = RecipePreference & ScopedDocumentFields;

/**
 * Scope-partitioned store for per-user recipe preferences. There is at most one
 * live document per owner within a scope; the service treats reads as
 * "return the single doc or defaults" and writes as upsert.
 */
@Injectable()
export class RecipePreferenceRepository extends ScopedRepository<RecipePreferenceEntity> {
  constructor(
    @InjectModel(RecipePreference.name) model: Model<RecipePreferenceEntity>,
  ) {
    super(model);
  }

  /** The caller's single preference document, or null when none exists yet. */
  findForOwner(
    scope: ScopeContext,
  ): Promise<HydratedDocument<RecipePreferenceEntity> | null> {
    return this.findOne(scope);
  }
}
