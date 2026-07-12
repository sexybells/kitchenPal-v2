import { Pressable, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Badge, Icon, Text } from "../../ui";
import { theme } from "../../theme";
import type { NotificationResponse } from "@kitchenpal/api-contract";
import { notificationMeta, notificationPreview } from "./labels";

export interface NotificationRowProps {
  notification: NotificationResponse;
  onPress: (notification: NotificationResponse) => void;
  testID?: string;
}

/**
 * One notification: typed icon + badge, an optional preview line, and an unread
 * dot. Tapping marks it read and deep-links to the relevant screen.
 */
export function NotificationRow({
  notification,
  onPress,
  testID,
}: NotificationRowProps) {
  const { t } = useTranslation();
  const meta = notificationMeta(t, notification.type);
  const preview = notificationPreview(notification);
  const unread = notification.readAt === null;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onPress(notification)}
      style={({ pressed }) => [
        styles.row,
        unread ? styles.unread : null,
        pressed ? styles.pressed : null,
      ]}
      testID={testID}
    >
      <View style={[styles.iconCircle, { backgroundColor: theme.colors["surface-alt"] }]}>
        <Icon name={meta.icon} size={20} color="text-muted" />
      </View>
      <View style={styles.body}>
        <Badge label={meta.label} tone={meta.tone} />
        {preview ? (
          <Text variant="body-m" color="text" numberOfLines={2}>
            {preview}
          </Text>
        ) : null}
      </View>
      {unread ? (
        <View style={styles.dot} testID={testID ? `${testID}-unread` : undefined} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[12],
    paddingVertical: theme.spacing[12],
    paddingHorizontal: theme.spacing[12],
    borderRadius: theme.radius.md,
  },
  unread: { backgroundColor: theme.colors["primary-soft"] },
  pressed: { opacity: 0.7 },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1, gap: theme.spacing[4], alignItems: "flex-start" },
  dot: {
    width: 10,
    height: 10,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primary,
  },
});
