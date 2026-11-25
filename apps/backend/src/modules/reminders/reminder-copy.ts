import type { Locale } from "@kitchenpal/api-contract";
import type { LunarDate } from "../../common/calendar/vietnamese-lunar";

/** Push title + body for one reminder. */
export interface PushCopy {
  title: string;
  body: string;
}

/** "tháng Giêng", "tháng 7", "tháng Chạp", "tháng 4 nhuận" / "lunar month 4 (leap)". */
export function lunarMonthLabel(lunar: LunarDate, locale: Locale): string {
  if (locale === "en") {
    return `lunar month ${lunar.month}${lunar.isLeapMonth ? " (leap)" : ""}`;
  }
  const name =
    lunar.month === 1 ? "Giêng" : lunar.month === 12 ? "Chạp" : String(lunar.month);
  return `tháng ${name}${lunar.isLeapMonth ? " nhuận" : ""}`;
}

/** A vegetarian lunar day: "rằm tháng Giêng" / "mùng 1 tháng Chạp" / "the 15th of lunar month 1". */
export function lunarDayLabel(lunar: LunarDate, locale: Locale): string {
  const month = lunarMonthLabel(lunar, locale);
  if (locale === "en") {
    return `the ${lunar.day === 1 ? "1st" : `${lunar.day}th`} of ${month}`;
  }
  return `${lunar.day === 15 ? "rằm" : `mùng ${lunar.day}`} ${month}`;
}

/** Eve-of-vegetarian-day push. `dish` is null when no vegetarian recipe passed the user's filters. */
export function vegetarianDayCopy(
  locale: Locale,
  lunar: LunarDate,
  dish: string | null,
): PushCopy {
  const day = lunarDayLabel(lunar, locale);
  if (locale === "en") {
    return {
      title: `Tomorrow is ${day}`,
      body: dish
        ? `Try: ${dish}. Shop for it this afternoon.`
        : "Remember to get vegetarian food in this afternoon.",
    };
  }
  return {
    title: `Mai là ${day}`,
    body: dish
      ? `Gợi ý: ${dish}. Đi chợ chiều nay nhé.`
      : "Nhớ chuẩn bị đồ chay, đi chợ chiều nay nhé.",
  };
}

/** Use-it-up push: cook `dish` tonight to use up the expiring `items`. */
export function expiryAlertCopy(locale: Locale, dish: string, items: string[]): PushCopy {
  const list = items.join(", ");
  if (locale === "en") {
    return {
      title: `Cook ${dish} tonight?`,
      body: `Use up ${list} before they spoil.`,
    };
  }
  return {
    title: `Tối nay nấu ${dish}?`,
    body: `Dùng hết ${list} trước khi hỏng.`,
  };
}
