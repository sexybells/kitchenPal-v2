import { Schema, SchemaTypes, Types } from "mongoose";
import type { DataScope } from "@kitchenpal/api-contract";

/**
 * Fields every platform document carries, added by {@link baseSchemaPlugin}.
 * - `createdBy` / `updatedBy`: audit references to the acting user.
 * - `deletedAt`: soft-delete tombstone (null = live).
 * - `version`: optimistic-concurrency counter, bumped on every write.
 * Timestamps (`createdAt` / `updatedAt`) are added via schema options.
 */
export interface BaseDocumentFields {
  createdBy?: Types.ObjectId | null;
  updatedBy?: Types.ObjectId | null;
  deletedAt: Date | null;
  version: number;
  createdAt?: Date;
  updatedAt?: Date;
}

/** Fields added by {@link scopedSchemaPlugin} for scope-aware documents. */
export interface ScopedDocumentFields extends BaseDocumentFields {
  scope: DataScope;
  householdId?: Types.ObjectId | null;
}

/**
 * Mongoose plugin adding the shared audit, soft-delete, and optimistic-lock
 * fields plus timestamps. Apply to every persisted schema.
 */
export function baseSchemaPlugin(schema: Schema): void {
  schema.add({
    createdBy: { type: SchemaTypes.ObjectId, default: null },
    updatedBy: { type: SchemaTypes.ObjectId, default: null },
    deletedAt: { type: Date, default: null, index: true },
    version: { type: Number, default: 0 },
  });
  schema.set("timestamps", true);
}

/**
 * Mongoose plugin adding data-scope fields. Combine with {@link baseSchemaPlugin}
 * on schemas that participate in `personal | household | system` scoping.
 */
export function scopedSchemaPlugin(schema: Schema): void {
  schema.add({
    scope: {
      type: String,
      enum: ["personal", "household", "system"],
      required: true,
      index: true,
    },
    householdId: { type: SchemaTypes.ObjectId, default: null, index: true },
  });
}
