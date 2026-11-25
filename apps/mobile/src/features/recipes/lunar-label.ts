import type { TFunction } from "i18next";

interface LunarDate {
  day: number;
  month: number;
  isLeapMonth: boolean;
}

/**
 * Localized lunar date, e.g. "rằm tháng 10" or "mùng 1 tháng Giêng". Month 1 and
 * 12 use their traditional names; a leap month gets the "nhuận" suffix.
 */
export function lunarDayLabel(t: TFunction, lunar: LunarDate): string {
  const dayText =
    lunar.day === 1
      ? t("home.lunar.day1")
      : lunar.day === 15
        ? t("home.lunar.day15")
        : t("home.lunar.dayN", { day: lunar.day });
  const monthName =
    lunar.month === 1
      ? t("home.lunar.monthFirst")
      : lunar.month === 12
        ? t("home.lunar.monthLast")
        : t("home.lunar.month", { month: lunar.month });
  const month = lunar.isLeapMonth
    ? t("home.lunar.leap", { month: monthName })
    : monthName;
  return `${dayText} ${month}`;
}
