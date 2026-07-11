import type {
  RecipeAiProvider,
  RecipeAiResult,
} from "./recipe-ai-provider";

/** Tunable knobs for the OpenAI text provider. */
export interface OpenAiRecipeOptions {
  apiKey: string;
  model: string;
  maxTokens: number;
  baseUrl?: string;
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string } }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

/**
 * Primary recipe-AI backend using OpenAI chat-completions (text only). Only
 * constructed when `OPENAI_API_KEY` is set. Output tokens are capped for cost and
 * a JSON response format is requested so the caller can parse deterministically.
 */
export class OpenAiRecipeProvider implements RecipeAiProvider {
  readonly name = "openai";

  constructor(private readonly options: OpenAiRecipeOptions) {}

  async complete(prompt: string): Promise<RecipeAiResult> {
    const base = this.options.baseUrl ?? "https://api.openai.com/v1";
    const response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.options.apiKey}`,
      },
      body: JSON.stringify({
        model: this.options.model,
        max_tokens: this.options.maxTokens,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      throw new Error(
        `OpenAI recipe request failed with status ${response.status}`,
      );
    }

    const body = (await response.json()) as ChatCompletionResponse;
    return {
      text: body.choices?.[0]?.message?.content ?? "",
      usage: {
        promptTokens: body.usage?.prompt_tokens,
        completionTokens: body.usage?.completion_tokens,
        totalTokens: body.usage?.total_tokens,
      },
    };
  }
}
