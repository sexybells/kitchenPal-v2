import { parseDetections, VISION_PROMPT } from "./detection-parser";
import type {
  VisionImage,
  VisionProvider,
  VisionProviderResult,
} from "./vision-provider";

/** Tunable knobs for the OpenAI vision provider. */
export interface OpenAiVisionOptions {
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
 * Primary food-vision backend using OpenAI chat-completions with an image part.
 * Only constructed when `OPENAI_API_KEY` is set. Sends the image inline as a
 * base64 data URL (never persisted or logged) and caps output tokens for cost.
 */
export class OpenAiVisionProvider implements VisionProvider {
  readonly name = "openai";

  constructor(private readonly options: OpenAiVisionOptions) {}

  async detect(image: VisionImage): Promise<VisionProviderResult> {
    const base = this.options.baseUrl ?? "https://api.openai.com/v1";
    const dataUrl = `data:${image.contentType};base64,${image.buffer.toString("base64")}`;

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
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: VISION_PROMPT },
              { type: "image_url", image_url: { url: dataUrl, detail: "low" } },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI vision request failed with status ${response.status}`);
    }

    const body = (await response.json()) as ChatCompletionResponse;
    const content = body.choices?.[0]?.message?.content ?? "";
    return {
      detections: parseDetections(content),
      usage: {
        promptTokens: body.usage?.prompt_tokens,
        completionTokens: body.usage?.completion_tokens,
        totalTokens: body.usage?.total_tokens,
      },
    };
  }
}
