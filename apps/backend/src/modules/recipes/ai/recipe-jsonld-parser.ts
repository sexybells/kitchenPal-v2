import type { MealType, RecipeDraft } from "@kitchenpal/api-contract";

/** Outcome of parsing a page: a best-effort draft (or null) plus warnings. */
export interface ParsedRecipe {
  draft: Partial<RecipeDraft> | null;
  warnings: string[];
}

const SCRIPT_LD_JSON =
  /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

/**
 * Extracts a schema.org Recipe from a page's JSON-LD blocks and maps it to a
 * recipe draft. Deliberately tolerant: it scans every `ld+json` block, unwraps
 * `@graph`/arrays, and skips malformed JSON, returning warnings instead of
 * throwing so a partial page still yields a reviewable draft (never auto-saved).
 */
export function parseRecipeFromHtml(
  html: string,
  sourceUrl: string,
): ParsedRecipe {
  const warnings: string[] = [];
  const node = findRecipeNode(html, warnings);
  if (!node) {
    return { draft: null, warnings };
  }

  const name = asString(node.name);
  if (!name) {
    warnings.push("Recipe has no name");
    return { draft: null, warnings };
  }

  const ingredients = toStringArray(
    node.recipeIngredient ?? node.ingredients,
  ).map((line) => ({ name: line, quantity: null, unit: null, optional: false }));
  const steps = parseInstructions(node.recipeInstructions);

  if (ingredients.length === 0) {
    warnings.push("No ingredients found");
  }
  if (steps.length === 0) {
    warnings.push("No steps found");
  }

  const draft: Partial<RecipeDraft> = {
    name: name.slice(0, 200),
    mealType: parseMealType(node.recipeCategory),
    tags: parseKeywords(node.keywords),
    cookTimeMinutes: parseDuration(node.totalTime ?? node.cookTime),
    servings: parseYield(node.recipeYield),
    ingredients: ingredients.slice(0, 200),
    steps: steps.slice(0, 200),
    imageUrl: parseImage(node.image),
    sourceUrl,
  };
  return { draft, warnings };
}

type JsonRecord = Record<string, unknown>;

function findRecipeNode(html: string, warnings: string[]): JsonRecord | null {
  const blocks = html.matchAll(SCRIPT_LD_JSON);
  for (const match of blocks) {
    const raw = match[1]?.trim();
    if (!raw) {
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      warnings.push("Skipped a malformed JSON-LD block");
      continue;
    }
    const recipe = pickRecipe(parsed);
    if (recipe) {
      return recipe;
    }
  }
  return null;
}

/** Recursively finds the first node whose `@type` includes `Recipe`. */
function pickRecipe(value: unknown): JsonRecord | null {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = pickRecipe(entry);
      if (found) {
        return found;
      }
    }
    return null;
  }
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as JsonRecord;
  if (isRecipeType(record["@type"])) {
    return record;
  }
  if (record["@graph"]) {
    return pickRecipe(record["@graph"]);
  }
  return null;
}

function isRecipeType(type: unknown): boolean {
  if (typeof type === "string") {
    return type.toLowerCase() === "recipe";
  }
  if (Array.isArray(type)) {
    return type.some(
      (entry) => typeof entry === "string" && entry.toLowerCase() === "recipe",
    );
  }
  return false;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function toStringArray(value: unknown): string[] {
  if (typeof value === "string") {
    return value.trim().length > 0 ? [value.trim()] : [];
  }
  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
      .filter((entry) => entry.length > 0);
  }
  return [];
}

function parseInstructions(value: unknown): string[] {
  if (typeof value === "string") {
    return value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }
  if (Array.isArray(value)) {
    const steps: string[] = [];
    for (const entry of value) {
      if (typeof entry === "string" && entry.trim()) {
        steps.push(entry.trim());
      } else if (entry && typeof entry === "object") {
        const text = asString((entry as JsonRecord).text);
        if (text) {
          steps.push(text);
        }
      }
    }
    return steps;
  }
  return [];
}

function parseMealType(value: unknown): MealType {
  const categories = toStringArray(value).map((c) => c.toLowerCase());
  return (
    MEAL_TYPES.find((meal) => categories.some((c) => c.includes(meal))) ??
    "dinner"
  );
}

function parseKeywords(value: unknown): string[] {
  if (typeof value === "string") {
    return value
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0)
      .slice(0, 30);
  }
  return toStringArray(value).slice(0, 30);
}

/** Parses an ISO-8601 duration (e.g. `PT1H30M`) into whole minutes. */
function parseDuration(value: unknown): number | null {
  const text = asString(value);
  if (!text) {
    return null;
  }
  const match = /P(?:\d+D)?T?(?:(\d+)H)?(?:(\d+)M)?/.exec(text);
  if (!match) {
    return null;
  }
  const hours = match[1] ? Number.parseInt(match[1], 10) : 0;
  const minutes = match[2] ? Number.parseInt(match[2], 10) : 0;
  const total = hours * 60 + minutes;
  return total > 0 ? total : null;
}

function parseYield(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(1, Math.trunc(value));
  }
  const text = asString(Array.isArray(value) ? value[0] : value);
  if (!text) {
    return null;
  }
  const match = /\d+/.exec(text);
  return match ? Math.max(1, Number.parseInt(match[0], 10)) : null;
}

function parseImage(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    const first = value[0];
    if (typeof first === "string") {
      return first;
    }
    if (first && typeof first === "object") {
      return asString((first as JsonRecord).url);
    }
  }
  if (value && typeof value === "object") {
    return asString((value as JsonRecord).url);
  }
  return null;
}
