import type { MealType } from "@kitchenpal/api-contract";
import type { ColorToken } from "../../theme";
import { dishEmoji } from "./labels";

/** What to render in place of a photo the recipe does not have. */
export interface DishPlaceholder {
  emoji: string;
  background: ColorToken;
}

/**
 * Dish-level emoji keyed by a word in the recipe name, most specific first —
 * "bánh mì" must win over "bánh", "khoai" over "chiên".
 *
 * These stay DISH-level (a bowl, a plate, a cooked cut) rather than raw
 * ingredients, matching the rule behind `dishEmoji` in `labels.ts`: cooked-dish
 * emoji are fine as imagery, raw ingredients use line icons instead.
 */
const EMOJI_BY_KEYWORD: readonly (readonly [string, string])[] = [
  ["bánh mì", "🥖"],
  ["bánh flan", "🍮"],
  ["bánh cuốn", "🥟"],
  ["bánh canh", "🍜"],
  ["bánh chuối", "🍰"],
  ["gỏi cuốn", "🥟"],
  ["hủ tiếu", "🍜"],
  ["sinh tố", "🥤"],
  ["sữa chua", "🍨"],
  ["chuối chiên", "🍩"],
  ["khoai", "🍟"],
  ["bắp xào", "🍿"],
  ["chè", "🍧"],
  ["xôi", "🍙"],
  ["cháo", "🥣"],
  ["phở", "🍜"],
  ["bún", "🍜"],
  ["miến", "🍜"],
  ["mì", "🍜"],
  ["cơm", "🍚"],
  ["salad", "🥗"],
  ["canh", "🍲"],
  ["lẩu", "🍲"],
  ["tôm", "🍤"],
  ["mực", "🍤"],
  ["cua", "🍤"],
  ["hải sản", "🍤"],
  ["cá", "🐟"],
  ["gà", "🍗"],
  ["bò", "🥩"],
  ["sườn", "🍖"],
  ["heo", "🍖"],
  ["thịt", "🍖"],
  ["trứng", "🍳"],
  ["đậu hũ", "🍲"],
  ["nấm", "🍲"],
  ["rau", "🥗"],
  ["cải", "🥗"],
  ["su su", "🥗"],
];

/**
 * Pale surface tints a placeholder can sit on. All are `*-soft` brand/status
 * tokens, so the grid reads as one warm family rather than a random palette.
 */
const BACKGROUNDS: readonly ColorToken[] = [
  "primary-soft",
  "secondary-soft",
  "accent-soft",
  "info-soft",
  "success-soft",
  "warning-soft",
];

/**
 * The stand-in for a recipe with no photo: a dish emoji picked from the recipe's
 * name and a tint picked from the same name.
 *
 * Deterministic on purpose — one dish always looks the same across the feed, the
 * planner and the detail screen, so the placeholder reads as that dish's
 * identity rather than as a missing image. Falls back to the meal-type emoji
 * when no keyword matches, so an imported or user-written recipe in any language
 * still gets something sensible.
 */
export function dishPlaceholder(
  name: string,
  mealType: MealType,
): DishPlaceholder {
  return {
    emoji: emojiForName(name) ?? dishEmoji(mealType),
    background: backgroundForName(name),
  };
}

/** First keyword occurring as a whole word in the name, in table order. */
function emojiForName(name: string): string | null {
  // Padded both ends and matched as a whole word, so "cá" cannot match inside
  // "cà chua" and a keyword still matches at the start or end of the name.
  const padded = ` ${name.normalize("NFC").trim().toLowerCase()} `;
  for (const [keyword, emoji] of EMOJI_BY_KEYWORD) {
    if (padded.includes(` ${keyword} `)) {
      return emoji;
    }
  }
  return null;
}

/** Stable tint for a name — same dish, same colour, every screen. */
function backgroundForName(name: string): ColorToken {
  const normalized = name.normalize("NFC").trim().toLowerCase();
  let hash = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    hash = (hash * 31 + normalized.charCodeAt(index)) % 100_000;
  }
  return BACKGROUNDS[hash % BACKGROUNDS.length] ?? "surface-alt";
}
