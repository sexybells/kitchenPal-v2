import { RecipeAiService, type RankCandidate } from "./recipe-ai.service";
import type { RecipeAiProvider } from "./recipe-ai-provider";

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

const logger = { warn: jest.fn(), error: jest.fn() } as never;

const candidates: RankCandidate[] = [
  { recipeId: "a", name: "A", mealType: "dinner", tags: [], matchScore: 0.2, rescueCount: 0, isVegetarian: false },
  { recipeId: "b", name: "B", mealType: "dinner", tags: [], matchScore: 0.9, rescueCount: 0, isVegetarian: false },
];

function provider(
  name: string,
  impl: (prompt: string) => Promise<{ text: string; usage: object }>,
): RecipeAiProvider {
  return { name, complete: impl };
}

describe("RecipeAiService", () => {
  it("degrades to no ranking when no provider is configured", async () => {
    const aiLogs = createAiLogs();
    const service = new RecipeAiService([], aiLogs as never, logger);

    const result = await service.rank("op", "goal", candidates, "user-1");

    expect(result).toEqual({ order: null, provider: "none", degraded: true });
    // Nothing to call, so no per-provider log entry is written.
    expect(aiLogs.entries).toHaveLength(0);
  });

  it("degrades when there are no candidates to rank", async () => {
    const aiLogs = createAiLogs();
    const complete = jest.fn();
    const service = new RecipeAiService(
      [provider("openai", complete)],
      aiLogs as never,
      logger,
    );

    const result = await service.rank("op", "goal", [], "user-1");

    expect(result.degraded).toBe(true);
    expect(complete).not.toHaveBeenCalled();
  });

  it("returns the provider's validated order and logs success", async () => {
    const aiLogs = createAiLogs();
    const service = new RecipeAiService(
      [
        provider("openai", async () => ({
          // "c" is not a candidate and must be dropped.
          text: '{"order":["b","c","a"]}',
          usage: { totalTokens: 10 },
        })),
      ],
      aiLogs as never,
      logger,
    );

    const result = await service.rank("op", "goal", candidates, "user-1");

    expect(result.order).toEqual(["b", "a"]);
    expect(result.provider).toBe("openai");
    expect(result.degraded).toBe(false);
    expect(aiLogs.entries).toEqual([{ provider: "openai", success: true }]);
  });

  it("falls back to the next provider when the primary throws", async () => {
    const aiLogs = createAiLogs();
    const service = new RecipeAiService(
      [
        provider("openai", async () => {
          throw new Error("rate limited");
        }),
        provider("gemini", async () => ({
          text: '{"order":["a","b"]}',
          usage: {},
        })),
      ],
      aiLogs as never,
      logger,
    );

    const result = await service.rank("op", "goal", candidates, "user-1");

    expect(result.provider).toBe("gemini");
    expect(result.order).toEqual(["a", "b"]);
    expect(aiLogs.entries).toEqual([
      { provider: "openai", success: false },
      { provider: "gemini", success: true },
    ]);
  });

  it("degrades when the provider returns no usable ids", async () => {
    const aiLogs = createAiLogs();
    const service = new RecipeAiService(
      [provider("openai", async () => ({ text: "not json", usage: {} }))],
      aiLogs as never,
      logger,
    );

    const result = await service.rank("op", "goal", candidates, "user-1");

    expect(result.order).toBeNull();
    expect(result.degraded).toBe(true);
  });
});
