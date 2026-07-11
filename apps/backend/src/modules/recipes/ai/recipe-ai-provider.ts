/** Token/cost usage a provider reports, for AiLog cost tracking. */
export interface RecipeAiUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

/** Raw text completion returned by a provider. */
export interface RecipeAiResult {
  text: string;
  usage: RecipeAiUsage;
}

/**
 * A pluggable text-LLM backend (OpenAI, Gemini, …) used to rank recipe
 * candidates for suggestions and meal auto-fill. Providers are only constructed
 * when their API key is configured, so `complete` always has a key. A provider
 * throws on transport/parse failure; the orchestrator decides whether to fall
 * back to the next provider or degrade to deterministic heuristics.
 */
export interface RecipeAiProvider {
  /** Stable identifier written to AiLog (e.g. "openai", "gemini"). */
  readonly name: string;
  complete(prompt: string): Promise<RecipeAiResult>;
}

/** DI token for the ordered list of configured recipe-AI providers. */
export const RECIPE_AI_PROVIDERS = "RECIPE_AI_PROVIDERS";
