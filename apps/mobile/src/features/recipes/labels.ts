import type { TFunction } from "i18next";
import type { MealType } from "@kitchenpal/api-contract";

/** Meal types in display order — drives the slot rows and meal-type chips. */
export const MEAL_TYPES: readonly MealType[] = [
  "breakfast",
  "lunch",
  "dinner",
  "snack",
];

/** Localize a meal type via the shared `meals.mealType.*` keys. */
export const mealTypeLabel = (t: TFunction, mealType: MealType): string =>
  t(`meals.mealType.${mealType}`);

/**
 * Days of the week, 0 = Monday … 6 = Sunday (matching the backend
 * `dayOfWeekSchema`). Used to render the day selector.
 */
export const DAYS_OF_WEEK = [0, 1, 2, 3, 4, 5, 6] as const;

/** Translation keys for each weekday, indexed by day-of-week number. */
const DAY_KEYS = [
  "meals.day.0",
  "meals.day.1",
  "meals.day.2",
  "meals.day.3",
  "meals.day.4",
  "meals.day.5",
  "meals.day.6",
] as const;

/** Localize a day-of-week index via the `meals.day.*` keys. */
export const dayLabel = (t: TFunction, day: number): string =>
  t(DAY_KEYS[day] ?? DAY_KEYS[0]);

/**
 * A cooked-dish emoji per meal type, used as a card thumbnail when a recipe has
 * no image. Per the design rule, cooked-dish emoji are fine here; raw
 * ingredients use line icons instead.
 */
const DISH_EMOJI: Record<MealType, string> = {
  breakfast: "🥐",
  lunch: "🍜",
  dinner: "🍲",
  snack: "🍪",
};

export const dishEmoji = (mealType: MealType): string => DISH_EMOJI[mealType];

/**
 * Monday-anchored start of the ISO week for `date`, at 00:00 UTC — matches the
 * backend's `startOfWeekUtc` so a client-created plan lands on the same week.
 */
export const startOfWeekUtc = (date: Date): Date => {
  const utc = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const dayFromMonday = (utc.getUTCDay() + 6) % 7;
  utc.setUTCDate(utc.getUTCDate() - dayFromMonday);
  return utc;
};

/** Render a 1..5 rating into filled/empty star booleans for display. */
export const starFill = (rating: number): boolean[] =>
  [1, 2, 3, 4, 5].map((position) => rating >= position - 0.25);
