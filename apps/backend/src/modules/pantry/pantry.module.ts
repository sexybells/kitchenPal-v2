import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { APP_CONFIG, AppConfig } from "../../config/env.schema";
import { LogsModule } from "../logs/logs.module";
import { UploadsModule } from "../uploads/uploads.module";
import { AiVisionService } from "./ai/ai-vision.service";
import { GeminiVisionProvider } from "./ai/gemini-vision.provider";
import { OpenAiVisionProvider } from "./ai/openai-vision.provider";
import {
  VISION_PROVIDERS,
  type VisionProvider,
} from "./ai/vision-provider";
import { PantryController } from "./pantry.controller";
import { PantryScansController } from "./pantry-scans.controller";
import { PantryItemRepository } from "./repositories/pantry-item.repository";
import { PantryScanRepository } from "./repositories/pantry-scan.repository";
import { PantryItem, PantryItemSchema } from "./schemas/pantry-item.schema";
import { PantryScan, PantryScanSchema } from "./schemas/pantry-scan.schema";
import { PantryScanService } from "./services/pantry-scan.service";
import { PantryService } from "./services/pantry.service";

/**
 * Builds the ordered vision provider chain from config: OpenAI primary, Gemini
 * fallback. A provider is only constructed when its key is present, so with no
 * keys the array is empty and scans degrade to manual entry — never a crash.
 */
const visionProvidersProvider = {
  provide: VISION_PROVIDERS,
  inject: [APP_CONFIG],
  useFactory: (config: AppConfig): VisionProvider[] => {
    const providers: VisionProvider[] = [];
    if (config.OPENAI_API_KEY) {
      providers.push(
        new OpenAiVisionProvider({
          apiKey: config.OPENAI_API_KEY,
          model: config.OPENAI_VISION_MODEL,
          maxTokens: config.AI_VISION_MAX_TOKENS,
        }),
      );
    }
    if (config.GEMINI_API_KEY) {
      providers.push(
        new GeminiVisionProvider({
          apiKey: config.GEMINI_API_KEY,
          model: config.GEMINI_VISION_MODEL,
          maxTokens: config.AI_VISION_MAX_TOKENS,
        }),
      );
    }
    return providers;
  },
};

/**
 * Pantry module: stock-state items, photo scans with AI vision, and the
 * cook→deplete→refill loop. Reuses the storage adapter (UploadsModule) and the
 * AI audit log (LogsModule) rather than redefining them.
 */
@Module({
  imports: [
    LogsModule,
    UploadsModule,
    MongooseModule.forFeature([
      { name: PantryItem.name, schema: PantryItemSchema },
      { name: PantryScan.name, schema: PantryScanSchema },
    ]),
  ],
  controllers: [PantryController, PantryScansController],
  providers: [
    PantryService,
    PantryScanService,
    PantryItemRepository,
    PantryScanRepository,
    AiVisionService,
    visionProvidersProvider,
  ],
  // Pantry stock is needed by the recipes module (pantry-match, pantry-based
  // suggestions, auto-fill), so expose the item repository to importers.
  exports: [PantryItemRepository],
})
export class PantryModule {}
