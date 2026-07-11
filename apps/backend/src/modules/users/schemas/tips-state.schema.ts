import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";
import {
  baseSchemaPlugin,
  scopedSchemaPlugin,
} from "../../../common/database/base.schema";

export type TipsStateDocument = HydratedDocument<TipsState>;

/**
 * Tracks onboarding coach-marks the user has already seen. Personal-scoped
 * (one document per user, owned via `createdBy`), created lazily with empty
 * defaults. `dismissedAll` lets a user turn every tip off at once.
 */
@Schema({ collection: "tips_states" })
export class TipsState {
  @Prop({ type: [String], default: [] })
  seen!: string[];

  @Prop({ default: false })
  dismissedAll!: boolean;
}

export const TipsStateSchema = SchemaFactory.createForClass(TipsState);
TipsStateSchema.plugin(baseSchemaPlugin);
TipsStateSchema.plugin(scopedSchemaPlugin);
