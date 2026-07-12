import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Badge, Icon, Text } from "../../ui";
import { theme } from "../../theme";
import { messageTime, systemCardMeta } from "./labels";
import type { ChatMessage } from "./message-model";

export interface SystemCardProps {
  message: ChatMessage;
  testID?: string;
}

/**
 * A system card posted by the spending seam — a logged household expense or a
 * budget alert. Rendered centered, distinct from member bubbles, with a typed
 * badge and the server-authored summary text.
 */
export function SystemCard({ message, testID }: SystemCardProps) {
  const { t } = useTranslation();
  if (message.type !== "expense" && message.type !== "budget_alert") {
    return null;
  }
  const meta = systemCardMeta(t, message.type);

  return (
    <View style={styles.wrapper} testID={testID}>
      <View style={styles.card}>
        <View style={styles.header}>
          <Icon name={meta.icon} size={18} color="text-muted" />
          <Badge label={meta.title} tone={meta.tone} />
        </View>
        {message.text ? (
          <Text variant="body-m" color="text" center>
            {message.text}
          </Text>
        ) : null}
        <Text variant="overline" color="text-subtle">
          {messageTime(message.createdAt)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: "center", marginVertical: theme.spacing[8] },
  card: {
    maxWidth: "88%",
    alignItems: "center",
    gap: theme.spacing[8],
    backgroundColor: theme.colors["surface-alt"],
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing[16],
    paddingVertical: theme.spacing[12],
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[8],
  },
});
