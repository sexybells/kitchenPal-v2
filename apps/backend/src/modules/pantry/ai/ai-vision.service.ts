import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import type { Cache } from "cache-manager";
import type { PantryDetection } from "@kitchenpal/api-contract";
import { AppLogger } from "../../../common/logging/app-logger.service";
import { AiLogRepository } from "../../logs/repositories/ai-log.repository";
import type {
  VisionImage,
  VisionProvider,
} from "./vision-provider";
import { VISION_PROVIDERS } from "./vision-provider";

/** Outcome of a vision detection, including the honest degrade signal. */
export interface VisionResult {
  provider: string;
  detections: PantryDetection[];
  /**
   * True when no provider produced a result (no keys configured or every
   * provider errored). Detections are empty and the caller must fall back to
   * manual entry — this is never a fabricated set.
   */
  degraded: boolean;
}

const AI_OPERATION = "pantry.scan.detect";
/** Cache identical images briefly so a retry/re-open is cheap. */
const CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * Orchestrates food-vision detection across the configured providers (OpenAI
 * primary, Gemini fallback) and degrades safely when none succeed. Every
 * attempt is written to AiLog for cost/reliability tracking, and identical
 * images are cached by content hash. Image bytes and API keys are never logged.
 */
@Injectable()
export class AiVisionService {
  constructor(
    @Inject(VISION_PROVIDERS) private readonly providers: VisionProvider[],
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly aiLogs: AiLogRepository,
    private readonly logger: AppLogger,
  ) {}

  async detect(image: VisionImage, userId: string): Promise<VisionResult> {
    const cacheKey = `pantry:vision:${hashImage(image.buffer)}`;
    const cached = await this.cache.get<VisionResult>(cacheKey);
    if (cached) {
      return cached;
    }

    for (const provider of this.providers) {
      const result = await this.tryProvider(provider, image, userId);
      if (result) {
        await this.cache.set(cacheKey, result, CACHE_TTL_MS);
        return result;
      }
    }

    // No provider available or all failed: honest manual-entry fallback. Logged
    // so the gap is visible, and flagged so the client cannot mistake the empty
    // set for real detections.
    this.logger.warn(
      this.providers.length === 0
        ? "Pantry scan requested with no AI vision provider configured; degrading to manual entry"
        : "All AI vision providers failed; degrading to manual entry",
      AiVisionService.name,
    );
    await this.recordLog("none", userId, {
      success: false,
      response: { degraded: true, reason: "no_provider_available" },
    });
    return { provider: "none", detections: [], degraded: true };
  }

  private async tryProvider(
    provider: VisionProvider,
    image: VisionImage,
    userId: string,
  ): Promise<VisionResult | null> {
    const startedAt = Date.now();
    try {
      const { detections, usage } = await provider.detect(image);
      await this.recordLog(provider.name, userId, {
        success: true,
        latencyMs: Date.now() - startedAt,
        response: { detectionCount: detections.length, usage },
      });
      return { provider: provider.name, detections, degraded: false };
    } catch (error) {
      // Log the failure (message only, never the image) and let the loop try the
      // next provider.
      await this.recordLog(provider.name, userId, {
        success: false,
        latencyMs: Date.now() - startedAt,
        response: { error: errorMessage(error) },
      });
      this.logger.warn(
        `AI vision provider ${provider.name} failed: ${errorMessage(error)}`,
        AiVisionService.name,
      );
      return null;
    }
  }

  private async recordLog(
    provider: string,
    userId: string,
    fields: {
      success: boolean;
      latencyMs?: number;
      response?: Record<string, unknown>;
    },
  ): Promise<void> {
    try {
      await this.aiLogs.create({
        provider,
        operation: AI_OPERATION,
        success: fields.success,
        latencyMs: fields.latencyMs,
        response: fields.response,
        userId: userId as unknown as never,
      });
    } catch (error) {
      // Audit logging must never break the request path.
      this.logger.error(
        `Failed to write AI log entry: ${errorMessage(error)}`,
        undefined,
        AiVisionService.name,
      );
    }
  }
}

function hashImage(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
