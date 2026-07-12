import { z } from "zod";
import {
  notificationResponseSchema,
  type NotificationQuery,
  type NotificationResponse,
} from "@kitchenpal/api-contract";
import { api } from "./api";

/** The list endpoint returns `data: Notification[]` in the paginated envelope. */
const notificationListSchema = z.array(notificationResponseSchema);

/** Serialise the notification query, skipping empty values. */
const toNotificationQuery = (query: Partial<NotificationQuery>): string => {
  const params = new URLSearchParams();
  if (query.limit) params.set("limit", String(query.limit));
  if (query.cursor) params.set("cursor", query.cursor);
  if (query.unreadOnly) params.set("unreadOnly", "true");
  const qs = params.toString();
  return qs ? `?${qs}` : "";
};

/**
 * The caller's in-app notifications. Every row is addressed to the authenticated
 * user server-side, so a caller only sees or mutates their own.
 */
export const notificationsApi = {
  list: (
    query: Partial<NotificationQuery> = {},
  ): Promise<NotificationResponse[]> =>
    api.request(`notifications${toNotificationQuery(query)}`, {
      method: "GET",
      auth: true,
      schema: notificationListSchema,
    }),

  markRead: (id: string): Promise<NotificationResponse> =>
    api.request(`notifications/${id}/read`, {
      method: "PATCH",
      auth: true,
      schema: notificationResponseSchema,
    }),
};
