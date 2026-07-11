import type { PantryDetection } from "@kitchenpal/api-contract";

/** The image handed to a vision provider. Bytes never leave the process. */
export interface VisionImage {
  buffer: Buffer;
  contentType: string;
}

/** Token/cost usage a provider reports, for AiLog cost tracking. */
export interface VisionUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  /** Estimated cost in USD, when the provider or a price map can compute it. */
  estimatedCostUsd?: number;
}

/** A successful detection result from one provider. */
export interface VisionProviderResult {
  detections: PantryDetection[];
  usage: VisionUsage;
}

/**
 * A pluggable food-vision backend (OpenAI, Gemini, …). Providers are only
 * constructed when their API key is configured, so `detect` always has a key.
 * A provider throws on transport/parse failure; the orchestrator decides whether
 * to fall back to the next provider or degrade to manual entry.
 */
export interface VisionProvider {
  /** Stable identifier written to AiLog (e.g. "openai", "gemini"). */
  readonly name: string;
  detect(image: VisionImage): Promise<VisionProviderResult>;
}

/** DI token for the ordered list of configured vision providers. */
export const VISION_PROVIDERS = "VISION_PROVIDERS";
