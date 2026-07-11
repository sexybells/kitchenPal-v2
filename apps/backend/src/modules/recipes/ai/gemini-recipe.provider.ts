import type {
  RecipeAiProvider,
  RecipeAiResult,
} from "./recipe-ai-provider";

/** Tunable knobs for the Gemini text provider. */
export interface GeminiRecipeOptions {
  apiKey: string;
  model: string;
  maxTokens: number;
  baseUrl?: string;
}

interface GenerateContentResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

/**
 * Fallback recipe-AI backend using Gemini `generateContent` (text only). Only
 * constructed when `GEMINI_API_KEY` is set. Output tokens are capped for cost and
 * a JSON response MIME type is requested for deterministic parsing.
 */
export class GeminiRecipeProvider implements RecipeAiProvider {
  readonly name = "gemini";

  constructor(private readonly options: GeminiRecipeOptions) {}

  async complete(prompt: string): Promise<RecipeAiResult> {
    const base =
      this.options.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta";
    const url = `${base}/models/${this.options.model}:generateContent`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": this.options.apiKey,
      },
      body: JSON.stringify({
        generationConfig: {
          temperature: 0,
          maxOutputTokens: this.options.maxTokens,
          responseMimeType: "application/json",
        },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Gemini recipe request failed with status ${response.status}`,
      );
    }

    const body = (await response.json()) as GenerateContentResponse;
    const text =
      body.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? "")
        .join("") ?? "";
    return {
      text,
      usage: {
        promptTokens: body.usageMetadata?.promptTokenCount,
        completionTokens: body.usageMetadata?.candidatesTokenCount,
        totalTokens: body.usageMetadata?.totalTokenCount,
      },
    };
  }
}
