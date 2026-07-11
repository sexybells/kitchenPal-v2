import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { ScopedRepository } from "../../../common/database/base.repository";
import type { ScopedDocumentFields } from "../../../common/database/base.schema";
import { PantryScan } from "../schemas/pantry-scan.schema";

export type PantryScanEntity = PantryScan & ScopedDocumentFields;

/**
 * Scope-partitioned store for photo scans. Reads and writes are scope-filtered,
 * so a caller can only ever fetch or confirm their own scans.
 */
@Injectable()
export class PantryScanRepository extends ScopedRepository<PantryScanEntity> {
  constructor(@InjectModel(PantryScan.name) model: Model<PantryScanEntity>) {
    super(model);
  }
}
