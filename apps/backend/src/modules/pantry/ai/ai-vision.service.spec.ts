import type { Cache } from "cache-manager";
import type { PantryDetection } from "@kitchenpal/api-contract";
import { AiVisionService } from "./ai-vision.service";
import type {
  VisionImage,
  VisionProvider,
  VisionProviderResult,
} from "./vision-provider";

/** In-memory cache stand-in implementing the slice the service uses. */
function createCache(): Cache {
  const store = new Map<string, unknown>();
  return {
    get: async <T>(key: string) => (store.get(key) as T) ?? null,
    set: async (key: string, value: unknown) => {
      store.set(key, value);
      return value;
    },
  } as unknown as Cache;
}

/** Captures AiLog writes without a database. */
function createAiLogs(): {
  create: jest.Mock;
  entries: { provider: string; success: boolean }[];
} {
  const entries: { provider: string; success: boolean }[] = [];
  const create = jest.fn(async (data: { provider: string; success: boolean }) => {
    entries.push({ provider: data.provider, success: data.success });
    return data;
  });
  return { create, entries };
}

const image: VisionImage = {
  buffer: Buffer.from("fake-image-bytes"),
  contentType: "image/jpeg",
};

const detection: PantryDetection = {
  name: "Milk",
  category: "Dairy",
  quantity: 1,
  unit: "carton",
  stockState: "some",
  confidence: 0.9,
  confidenceState: "estimated",
  lowConfidence: false,
};

function provider(
  name: string,
  impl: () => Promise<VisionProviderResult>,
): VisionProvider {
  return { name, detect: impl };
}

describe("AiVisionService", () => {
  it("returns detections from the primary provider and logs success", async () => {
    const aiLogs = createAiLogs();
    const primary = provider("openai", async () => ({
      detections: [detection],
      usage: { totalTokens: 42 },
    }));
    const service = new AiVisionService(
      [primary],
      createCache(),
      aiLogs as never,
      undefined as never,
    );

    const result = await service.detect(image, "user-1");

    expect(result.provider).toBe("openai");
    expect(result.degraded).toBe(false);
    expect(result.detections).toHaveLength(1);
    expect(aiLogs.entries).toEqual([{ provider: "openai", success: true }]);
  });

  it("falls back to the next provider when the primary throws", async () => {
    const aiLogs = createAiLogs();
    const failing = provider("openai", async () => {
      throw new Error("rate limited");
    });
    const fallback = provider("gemini", async () => ({
      detections: [detection],
      usage: {},
    }));
    const service = new AiVisionService(
      [failing, fallback],
      createCache(),
      aiLogs as never,
      { warn: jest.fn(), error: jest.fn() } as never,
    );

    const result = await service.detect(image, "user-1");

    expect(result.provider).toBe("gemini");
    expect(result.degraded).toBe(false);
    expect(aiLogs.entries).toEqual([
      { provider: "openai", success: false },
      { provider: "gemini", success: true },
    ]);
  });

  it("degrades to a flagged empty result when no provider is configured", async () => {
    const aiLogs = createAiLogs();
    const service = new AiVisionService(
      [],
      createCache(),
      aiLogs as never,
      { warn: jest.fn(), error: jest.fn() } as never,
    );

    const result = await service.detect(image, "user-1");

    expect(result).toEqual({ provider: "none", detections: [], degraded: true });
    expect(aiLogs.entries).toEqual([{ provider: "none", success: false }]);
  });

  it("degrades when every provider errors", async () => {
    const aiLogs = createAiLogs();
    const failing = provider("openai", async () => {
      throw new Error("boom");
    });
    const alsoFailing = provider("gemini", async () => {
      throw new Error("boom too");
    });
    const service = new AiVisionService(
      [failing, alsoFailing],
      createCache(),
      aiLogs as never,
      { warn: jest.fn(), error: jest.fn() } as never,
    );

    const result = await service.detect(image, "user-1");

    expect(result.degraded).toBe(true);
    expect(result.provider).toBe("none");
    expect(aiLogs.entries.map((entry) => entry.provider)).toEqual([
      "openai",
      "gemini",
      "none",
    ]);
  });

  it("serves an identical image from cache without a second provider call", async () => {
    const aiLogs = createAiLogs();
    const detect = jest.fn(async () => ({ detections: [detection], usage: {} }));
    const service = new AiVisionService(
      [provider("openai", detect)],
      createCache(),
      aiLogs as never,
      undefined as never,
    );

    await service.detect(image, "user-1");
    await service.detect(image, "user-1");

    expect(detect).toHaveBeenCalledTimes(1);
  });
});
