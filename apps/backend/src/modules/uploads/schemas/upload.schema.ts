import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";
import { baseSchemaPlugin } from "../../../common/database/base.schema";

export type UploadDocument = HydratedDocument<Upload>;

/**
 * A record of a stored binary object (currently avatars). Written whenever the
 * storage adapter persists a file, so the admin console can audit uploads
 * without scanning the storage backend. The bytes live in storage; this row
 * only holds the key, public URL, and non-sensitive metadata.
 */
@Schema({ collection: "uploads" })
export class Upload {
  @Prop({ type: String, required: true, index: true })
  key!: string;

  @Prop({ type: String, required: true })
  url!: string;

  /** What the upload is for (e.g. `avatar`), for filtering in the console. */
  @Prop({ type: String, required: true, default: "avatar", index: true })
  kind!: string;

  @Prop({ type: String, required: true })
  contentType!: string;

  @Prop({ type: Number, required: true, default: 0, min: 0 })
  sizeBytes!: number;

  @Prop({ type: SchemaTypes.ObjectId, default: null, index: true })
  ownerUserId!: Types.ObjectId | null;
}

export const UploadSchema = SchemaFactory.createForClass(Upload);
UploadSchema.plugin(baseSchemaPlugin);
