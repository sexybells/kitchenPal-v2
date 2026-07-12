import type { NotificationResponse } from "@kitchenpal/api-contract";

/** A titled group of notifications for the sectioned list. */
export interface NotificationGroup {
  key: "new" | "earlier";
  items: NotificationResponse[];
}

/** Number of unread notifications in a list. */
export const unreadCount = (
  notifications: NotificationResponse[],
): number => notifications.filter((n) => n.readAt === null).length;

/**
 * Split notifications into "new" (unread) and "earlier" (read), preserving the
 * server's newest-first order within each group. Empty groups are dropped.
 */
export const groupNotifications = (
  notifications: NotificationResponse[],
): NotificationGroup[] => {
  const groups: NotificationGroup[] = [
    { key: "new", items: notifications.filter((n) => n.readAt === null) },
    { key: "earlier", items: notifications.filter((n) => n.readAt !== null) },
  ];
  return groups.filter((group) => group.items.length > 0);
};
