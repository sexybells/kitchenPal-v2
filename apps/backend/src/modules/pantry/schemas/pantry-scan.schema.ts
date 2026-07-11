import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";
import type {
  ConfidenceState,
  PantryScanStatus,
  StockState,
} from "@kitchenpal/api-contract";
import {
  baseSchemaPlugin,
  scopedSchemaPlugin,
} from "../../../common/database/base.schema";

export type PantryScanDocument = HydratedDocument<PantryScan>;

/** One AI-detected item embedded in a {@link PantryScan}. */
@Schema({ _id: false })
export class ScanDetection {
  @Prop({ type: String, required: true })
  name!: string;

  @Prop({ type: String, default: null })
  category!: string | null;

  @Prop({ type: Number, default: null })
  quantity!: number | null;

  @Prop({ type: String, default: null })
  unit!: string | null;

  @Prop({
    type: String,
    enum: ["plenty", "some", "low", "out"],
    default: "some",
  })
  stockState!: StockState;

  @Prop({ type: Number, default: 0, min: 0, max: 1 })
  confidence!: number;

  @Prop({
    type: String,
    enum: ["confirmed", "estimated", "low"],
    default: "estimated",
  })
  confidenceState!: ConfidenceState;

  @Prop({ type: Boolean, default: false })
  lowConfidence!: boolean;
}

export const ScanDetectionSchema = SchemaFactory.createForClass(ScanDetection);

/**
 * A photo scan: the stored image, the AI detections it produced, and its
 * confirmation lifecycle. Scope-partitioned like the items it materializes.
 * `degraded` marks scans where no AI provider was available, so the client
 * knows the (empty/low-confidence) detections require manual entry.
 */
@Schema({ collection: "pantry_scans" })
export class PantryScan {
  @Prop({ type: String, default: null })
  imageKey!: string | null;

  @Prop({ type: String, default: null })
  imageUrl!: string | null;

  @Prop({
    type: String,
    enum: ["pending", "ready", "confirmed", "failed"],
    required: true,
    default: "pending",
    index: true,
  })
  status!: PantryScanStatus;

  @Prop({ type: String, default: "none" })
  provider!: string;

  @Prop({ type: [ScanDetectionSchema], default: [] })
  detections!: ScanDetection[];

  @Prop({ type: Boolean, default: false })
  degraded!: boolean;

  @Prop({ type: [SchemaTypes.ObjectId], default: [] })
  materializedItemIds!: Types.ObjectId[];

  @Prop({ type: String, default: null })
  error!: string | null;
}

export const PantryScanSchema = SchemaFactory.createForClass(PantryScan);
PantryScanSchema.plugin(baseSchemaPlugin);
PantryScanSchema.plugin(scopedSchemaPlugin);
