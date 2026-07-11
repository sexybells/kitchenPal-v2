import type { PantryDetection, StockState } from "@kitchenpal/api-contract";

/**
 * Shared instruction sent to every vision model so their raw output has one
 * shape the parser can normalize. Kept provider-agnostic.
 */
export const VISION_PROMPT =
  "You are a kitchen inventory assistant. Identify distinct food or grocery " +
  "items visible in the photo. Respond with ONLY a JSON object of the form " +
  '{"items":[{"name":string,"category":string,"quantity":number|null,' +
  '"unit":string|null,"stockState":"plenty"|"some"|"low"|"out","confidence":' +
  "number between 0 and 1}]}. Do not include commentary. If nothing is " +
  'recognizable, return {"items":[]}.';

/** Below this confidence a detection is flagged for manual review. */
const LOW_CONFIDENCE_THRESHOLD = 0.5;

const STOCK_STATES: StockState[] = ["plenty", "some", "low", "out"];

interface RawItem {
  name?: unknown;
  category?: unknown;
  quantity?: unknown;
  unit?: unknown;
  stockState?: unknown;
  confidence?: unknown;
}

/**
 * Normalizes a raw model text response into typed detections. Tolerant of
 * models that wrap JSON in prose or code fences: it extracts the first JSON
 * object and ignores malformed entries rather than throwing, so a slightly
 * off-format response still yields usable detections.
 */
export function parseDetections(raw: string): PantryDetection[] {
  const json = extractJsonObject(raw);
  if (!json) {
    return [];
  }
  const items = Array.isArray((json as { items?: unknown }).items)
    ? ((json as { items: unknown[] }).items as RawItem[])
    : [];

  const detections: PantryDetection[] = [];
  for (const item of items) {
    if (typeof item?.name !== "string" || item.name.trim().length === 0) {
      continue;
    }
    const confidence = clampConfidence(item.confidence);
    detections.push({
      name: item.name.trim().slice(0, 120),
      category: typeof item.category === "string" ? item.category.trim() : null,
      quantity: toFiniteNumber(item.quantity),
      unit: typeof item.unit === "string" ? item.unit.trim() : null,
      stockState: toStockState(item.stockState),
      confidence,
      confidenceState: confidence < LOW_CONFIDENCE_THRESHOLD ? "low" : "estimated",
      lowConfidence: confidence < LOW_CONFIDENCE_THRESHOLD,
    });
  }
  return detections;
}

function extractJsonObject(raw: string): unknown {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) {
    return null;
  }
  try {
    return JSON.parse(raw.slice(start, end + 1)) as unknown;
  } catch {
    return null;
  }
}

function clampConfidence(value: unknown): number {
  const num = toFiniteNumber(value);
  if (num === null) {
    return 0;
  }
  return Math.min(1, Math.max(0, num));
}

function toFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toStockState(value: unknown): StockState {
  return typeof value === "string" && STOCK_STATES.includes(value as StockState)
    ? (value as StockState)
    : "some";
}
