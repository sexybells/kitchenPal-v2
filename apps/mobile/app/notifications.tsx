import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  Screen,
  ScreenHeader,
  Text,
} from "../src/ui";
import { theme } from "../src/theme";
import { resolveErrorMessage } from "../src/lib/error-message";
import type { NotificationResponse } from "@kitchenpal/api-contract";
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllRead,
  useNotificationStream,
} from "../src/features/notifications/hooks";
import {
  groupNotifications,
  unreadCount,
} from "../src/features/notifications/grouping";
import { notificationRoute } from "../src/features/notifications/labels";
import { NotificationRow } from "../src/features/notifications/NotificationRow";

/**
 * Notifications: grouped new/earlier with typed badges and unread state,
 * mark-all-read, and deep-link routing on tap. Registers the device push token
 * on mount (no-op on simulators / when push is unavailable) and refreshes live
 * as `notification` events arrive.
 */
export default function NotificationsScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  const notifications = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllRead();
  useNotificationStream();

  const data = notifications.data ?? [];
  const groups = groupNotifications(data);
  const unread = unreadCount(data);

  const openNotification = (notification: NotificationResponse) => {
    if (notification.readAt === null) markRead.mutate(notification.id);
    const href = notificationRoute(notification);
    if (href) router.push(href);
  };

  const markAllRead = () => {
    const unreadIds = data
      .filter((n) => n.readAt === null)
      .map((n) => n.id);
    if (unreadIds.length > 0) markAll.mutate(unreadIds);
  };

  return (
    <Screen testID="notifications-screen">
      <ScreenHeader
        title={t("menu.notifications")}
        onBack={() => router.back()}
        right={
          unread > 0 ? (
            <Button
              label={t("notifications.markAllRead")}
              variant="ghost"
              fullWidth={false}
              onPress={markAllRead}
              loading={markAll.isPending}
              testID="notifications-mark-all"
            />
          ) : undefined
        }
      />

      {notifications.isLoading ? (
        <LoadingState label={t("common.loading")} />
      ) : notifications.isError ? (
        <ErrorState
          title={t("states.errorTitle")}
          body={resolveErrorMessage(notifications.error, t) ?? t("states.errorBody")}
          retryLabel={t("common.retry")}
          onRetry={() => notifications.refetch()}
          testID="notifications-error"
        />
      ) : data.length === 0 ? (
        <EmptyState
          title={t("notifications.emptyTitle")}
          body={t("notifications.emptyBody")}
          icon="bell"
          testID="notifications-empty"
        />
      ) : (
        groups.map((group) => (
          <View key={group.key} style={styles.section}>
            <Text variant="label-s" color="text-muted" style={styles.sectionTitle}>
              {t(`notifications.group.${group.key}`)}
            </Text>
            {group.items.map((notification) => (
              <NotificationRow
                key={notification.id}
                notification={notification}
                onPress={openNotification}
                testID={`notification-${notification.id}`}
              />
            ))}
          </View>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: theme.spacing[16], gap: theme.spacing[4] },
  sectionTitle: {
    textTransform: "uppercase",
    marginBottom: theme.spacing[4],
    marginLeft: theme.spacing[12],
  },
});
