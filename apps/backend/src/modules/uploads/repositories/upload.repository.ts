import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { BaseRepository } from "../../../common/database/base.repository";
import type { BaseDocumentFields } from "../../../common/database/base.schema";
import { Upload } from "../schemas/upload.schema";

export type UploadEntity = Upload & BaseDocumentFields;

/** Data access for the global uploads audit collection. */
@Injectable()
export class UploadRepository extends BaseRepository<UploadEntity> {
  constructor(@InjectModel(Upload.name) model: Model<UploadEntity>) {
    super(model);
  }
}
