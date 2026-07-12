import type { TFunction } from "i18next";
import type { Href } from "expo-router";
import type {
  NotificationResponse,
  NotificationType,
} from "@kitchenpal/api-contract";
import type { BadgeTone, IconName } from "../../ui";

/** Icon + badge tone + localized label for a notification type. */
export interface NotificationMeta {
  icon: IconName;
  tone: BadgeTone;
  label: string;
}

/** Localization keys for notification type labels (keeps `t()` type-safe). */
type NotificationLabelKey =
  `notifications.type.${"expiry" | "budget" | "chat" | "mention" | "invite" | "inviteAccepted"}`;

const META: Record<
  NotificationType,
  { icon: IconName; tone: BadgeTone; labelKey: NotificationLabelKey }
> = {
  expiry_alert: { icon: "clock", tone: "warning", labelKey: "notifications.type.expiry" },
  budget_alert: { icon: "spending", tone: "danger", labelKey: "notifications.type.budget" },
  chat_message: { icon: "users", tone: "primary", labelKey: "notifications.type.chat" },
  chat_mention: { icon: "users", tone: "primary", labelKey: "notifications.type.mention" },
  household_invite: { icon: "household", tone: "info", labelKey: "notifications.type.invite" },
  invite_accepted: { icon: "household", tone: "success", labelKey: "notifications.type.inviteAccepted" },
};

export const notificationMeta = (
  t: TFunction,
  type: NotificationType,
): NotificationMeta => {
  const entry = META[type];
  return { icon: entry.icon, tone: entry.tone, label: t(entry.labelKey) };
};

/** Read a string field from a free-form notification payload, if present. */
const payloadString = (
  payload: Record<string, unknown>,
  key: string,
): string | undefined =>
  typeof payload[key] === "string" ? (payload[key] as string) : undefined;

/** A human-readable preview line for the notification, from its payload. */
export const notificationPreview = (
  notification: NotificationResponse,
): string | undefined =>
  payloadString(notification.payload, "preview") ??
  payloadString(notification.payload, "message") ??
  payloadString(notification.payload, "text") ??
  payloadString(notification.payload, "body");

/**
 * Where a notification deep-links when tapped. Chat notifications route into the
 * originating household's chat; invites into the household hub; alerts into the
 * relevant feature. Returns null when there is no meaningful destination.
 */
export const notificationRoute = (
  notification: NotificationResponse,
): Href | null => {
  const householdId = payloadString(notification.payload, "householdId");
  switch (notification.type) {
    case "chat_message":
    case "chat_mention":
      return householdId
        ? { pathname: "/chat", params: { householdId } }
        : "/household";
    case "household_invite":
    case "invite_accepted":
      return "/household";
    case "expiry_alert":
      return "/pantry";
    case "budget_alert":
      return "/spending";
    default:
      return null;
  }
};
