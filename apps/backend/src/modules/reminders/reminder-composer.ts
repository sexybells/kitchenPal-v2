import type { Locale } from "@kitchenpal/api-contract";
import type { LunarDate } from "../../common/calendar/vietnamese-lunar";
import { expiryAlertCopy, vegetarianDayCopy, type PushCopy } from "./reminder-copy";

export type ReminderKind = "vegetarian_day" | "expiry_alert";

export interface ReminderInput {
  locale: Locale;
  /** Set only when the user opted in and tomorrow is a lunar 1st/15th. */
  tomorrowLunar: LunarDate | null;
  vegetarianPick: { name: string } | null;
  rescuePick: { recipeId: string; name: string; items: string[] } | null;
}

export interface ComposedReminder {
  type: ReminderKind;
  /** Flat: the push sender spreads it into the push `data` next to `type`. */
  payload: Record<string, unknown>;
  push: PushCopy;
}

/**
 * Decides the single reminder to send, if any. Tomorrow's vegetarian day wins
 * (it is sent even with no dish: remembering the day is the point); otherwise a
 * use-it-up dish; otherwise nothing.
 */
export function composeReminder(input: ReminderInput): ComposedReminder | null {
  const { locale, tomorrowLunar, vegetarianPick, rescuePick } = input;
  // `preview` is the line the in-app notification list shows under the badge.
  if (tomorrowLunar) {
    const push = vegetarianDayCopy(locale, tomorrowLunar, vegetarianPick?.name ?? null);
    return {
      type: "vegetarian_day",
      payload: {
        lunarDay: tomorrowLunar.day,
        lunarMonth: tomorrowLunar.month,
        isLeapMonth: tomorrowLunar.isLeapMonth,
        ...(vegetarianPick ? { recipeName: vegetarianPick.name } : {}),
        preview: push.body,
      },
      push,
    };
  }
  if (rescuePick) {
    const push = expiryAlertCopy(locale, rescuePick.name, rescuePick.items);
    return {
      type: "expiry_alert",
      payload: {
        recipeId: rescuePick.recipeId,
        recipeName: rescuePick.name,
        items: rescuePick.items,
        preview: push.body,
      },
      push,
    };
  }
  return null;
}
