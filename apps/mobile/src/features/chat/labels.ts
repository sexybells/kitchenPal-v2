import type { TFunction } from "i18next";
import type { MessageType } from "@kitchenpal/api-contract";
import type { BadgeTone, IconName } from "../../ui";

/** Short HH:MM timestamp for a message, from its ISO `createdAt`. */
export const messageTime = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
};

/** Icon + tone + localized title for a system chat card. */
export interface CardMeta {
  icon: IconName;
  tone: BadgeTone;
  title: string;
}

export const systemCardMeta = (
  t: TFunction,
  type: Extract<MessageType, "expense" | "budget_alert">,
): CardMeta => {
  if (type === "budget_alert") {
    return { icon: "alert", tone: "danger", title: t("chat.card.budgetAlert") };
  }
  return { icon: "spending", tone: "primary", title: t("chat.card.expense") };
};
