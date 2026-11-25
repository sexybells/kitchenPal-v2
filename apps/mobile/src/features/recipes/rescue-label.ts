import type { TFunction } from "i18next";

/** "Dùng hết: cà chua, đậu bắp +1" — at most `max` names, then a "+n" remainder. */
export function rescueChipText(t: TFunction, names: readonly string[], max = 2): string {
  const shown = names.slice(0, max).join(", ");
  const extra = names.length - max;
  return t("home.useItUp", { names: extra > 0 ? `${shown} +${extra}` : shown });
}
