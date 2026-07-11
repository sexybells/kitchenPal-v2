import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { ScopedRepository } from "../../../common/database/base.repository";
import type { ScopedDocumentFields } from "../../../common/database/base.schema";
import { TipsState } from "../schemas/tips-state.schema";

export type TipsStateEntity = TipsState & ScopedDocumentFields;

/**
 * Personal-scoped store for a user's onboarding-tips state (one document per
 * user, owned via `createdBy`).
 */
@Injectable()
export class TipsStateRepository extends ScopedRepository<TipsStateEntity> {
  constructor(@InjectModel(TipsState.name) model: Model<TipsStateEntity>) {
    super(model);
  }
}
