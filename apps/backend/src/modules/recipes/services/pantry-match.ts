import type { StockState } from "@kitchenpal/api-contract";

/** A pantry item reduced to what ingredient matching needs. */
export interface PantryStockLike {
  id: string;
  name: string;
  stockState: StockState;
}

/** A recipe ingredient reduced to what matching needs. */
export interface IngredientLike {
  name: string;
  quantity: number | null;
  unit: string | null;
  optional: boolean;
}

/** One ingredient classified against the pantry. */
export interface IngredientMatch {
  ingredient: IngredientLike;
  available: boolean;
  pantryItemId: string | null;
}

/** Aggregate of a full recipe-vs-pantry comparison. */
export interface PantryMatchResult {
  matches: IngredientMatch[];
  available: IngredientMatch[];
  needed: IngredientMatch[];
  matchScore: number;
}

/** Splits a name into lowercased alphanumeric word tokens. */
function tokenize(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 0),
  );
}

/** Whether every token of `small` appears in `big`. */
function isSubset(small: Set<string>, big: Set<string>): boolean {
  for (const token of small) {
    if (!big.has(token)) {
      return false;
    }
  }
  return true;
}

/**
 * Token-set containment in either direction. This treats a pantry item as
 * satisfying an ingredient when one name's whole words are a subset of the
 * other's — so pantry "flour" matches recipe "2 cups flour", and pantry
 * "chicken" matches recipe "chicken breast" — without the substring
 * false-positives ("egg" ⊄ "eggplant", "salt" ⊄ "salted butter").
 */
function tokensMatch(a: Set<string>, b: Set<string>): boolean {
  return isSubset(a, b) || isSubset(b, a);
}

/**
 * Classifies each recipe ingredient as on-hand (`available`) or to-buy
 * (`needed`) against the caller's pantry. An ingredient is available when a
 * not-`out` pantry item's name matches by whole-word tokens. `matchScore` is the
 * fraction of ingredients already on hand. Optional ingredients are classified
 * too, but the score is computed over required ingredients so a missing garnish
 * does not distort "can I cook this?". A blank ingredient name never matches.
 */
export function matchIngredients(
  ingredients: IngredientLike[],
  pantry: PantryStockLike[],
): PantryMatchResult {
  const stock = pantry.map((item) => ({
    id: item.id,
    tokens: tokenize(item.name),
    inStock: item.stockState !== "out",
  }));

  const matches: IngredientMatch[] = ingredients.map((ingredient) => {
    const target = tokenize(ingredient.name);
    const hit =
      target.size === 0
        ? undefined
        : stock.find(
            (item) =>
              item.inStock &&
              item.tokens.size > 0 &&
              tokensMatch(item.tokens, target),
          );
    return {
      ingredient,
      available: Boolean(hit),
      pantryItemId: hit?.id ?? null,
    };
  });

  const available = matches.filter((match) => match.available);
  const needed = matches.filter((match) => !match.available);

  const required = matches.filter((match) => !match.ingredient.optional);
  const requiredAvailable = required.filter((match) => match.available);
  const matchScore =
    required.length === 0 ? 1 : requiredAvailable.length / required.length;

  return { matches, available, needed, matchScore };
}
