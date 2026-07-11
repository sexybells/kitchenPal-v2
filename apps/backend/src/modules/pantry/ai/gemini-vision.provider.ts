import { parseDetections, VISION_PROMPT } from "./detection-parser";
import type {
  VisionImage,
  VisionProvider,
  VisionProviderResult,
} from "./vision-provider";

/** Tunable knobs for the Gemini vision provider. */
export interface GeminiVisionOptions {
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
 * Fallback food-vision backend using Gemini `generateContent`. Only constructed
 * when `GEMINI_API_KEY` is set. The image is sent inline as base64 (never
 * persisted or logged) and output tokens are capped for cost.
 */
export class GeminiVisionProvider implements VisionProvider {
  readonly name = "gemini";

  constructor(private readonly options: GeminiVisionOptions) {}

  async detect(image: VisionImage): Promise<VisionProviderResult> {
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
        contents: [
          {
            role: "user",
            parts: [
              { text: VISION_PROMPT },
              {
                inlineData: {
                  mimeType: image.contentType,
                  data: image.buffer.toString("base64"),
                },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemini vision request failed with status ${response.status}`);
    }

    const body = (await response.json()) as GenerateContentResponse;
    const content =
      body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ??
      "";
    return {
      detections: parseDetections(content),
      usage: {
        promptTokens: body.usageMetadata?.promptTokenCount,
        completionTokens: body.usageMetadata?.candidatesTokenCount,
        totalTokens: body.usageMetadata?.totalTokenCount,
      },
    };
  }
}
