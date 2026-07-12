import { useEffect } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { notificationsApi } from "../../api/notifications";
import { chatSocket } from "../../api/chat-socket";

/** Notification query keys. */
export const notificationKeys = {
  list: ["notifications", "list"] as const,
};

/** The caller's notifications, newest-first. */
export const useNotifications = () =>
  useQuery({
    queryKey: notificationKeys.list,
    queryFn: () => notificationsApi.list({ limit: 50 }),
  });

export const useMarkNotificationRead = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: notificationKeys.list }),
  });
};

/** Mark every currently-unread notification read (no bulk endpoint server-side). */
export const useMarkAllRead = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (unreadIds: string[]) =>
      Promise.all(unreadIds.map((id) => notificationsApi.markRead(id))),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: notificationKeys.list }),
  });
};

/**
 * Keep the notification list live: connect the socket and refresh the list when
 * a `notification` event arrives on the user's room. Tears the listener down on
 * unmount (the shared socket connection is left intact for other consumers).
 */
export const useNotificationStream = (): void => {
  const client = useQueryClient();
  useEffect(() => {
    chatSocket.connect();
    const off = chatSocket.on("notification", () => {
      void client.invalidateQueries({ queryKey: notificationKeys.list });
    });
    return off;
  }, [client]);
};
