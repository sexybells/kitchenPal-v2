import type { StockState } from "@kitchenpal/api-contract";

/** A pantry item reduced to what ingredient matching needs. */
export interface PantryStockLike {
  id: string;
  name: string;
  stockState: StockState;
  /** When the item spoils; null when it has no expiry. */
  expiryDate: Date | null;
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

/**
 * Splits a name into lowercased word tokens.
 *
 * The split class is unicode-aware (`\p{L}\p{N}`) because ingredient and pantry
 * names are Vietnamese-first: an ASCII-only class would treat every accented
 * character as a separator and shred "thịt ba chỉ" into `th·t·ba·ch`, which both
 * loses real matches and invents false ones. Diacritics are deliberately KEPT —
 * stripping them would collapse distinct ingredients ("cá" vs "cà chua",
 * "bò" vs "bơ"). Names are NFC-normalized first so a decomposed form typed on
 * one keyboard matches the composed form stored elsewhere.
 */
function tokenize(value: string): Set<string> {
  return new Set(
    value
      .normalize("NFC")
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
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
  now: Date = new Date(),
): PantryMatchResult {
  // Link order (Array.sort is stable): unexpired dated items soonest first,
  // then undated items, then already-expired ones last, so an ingredient is
  // never linked to spoiled food while a usable item exists. This changes which
  // item is picked, never which ingredients are available.
  const nowMs = now.getTime();
  const rank = (item: PantryStockLike): number => {
    if (!item.expiryDate) return 1;
    return item.expiryDate.getTime() > nowMs ? 0 : 2;
  };
  const sorted = [...pantry].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (rank(a) === 0 && b.expiryDate && a.expiryDate
        ? a.expiryDate.getTime() - b.expiryDate.getTime()
        : 0),
  );
  const stock = sorted.map((item) => ({
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
