import { Image, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Text } from "../../ui";
import { theme } from "../../theme";
import { messageTime } from "./labels";
import { isSeenByOthers, type ChatMessage } from "./message-model";

export interface MessageBubbleProps {
  message: ChatMessage;
  isOwn: boolean;
  /** Sender display name, shown above incoming bubbles in a shared household. */
  senderName?: string;
  testID?: string;
}

/**
 * A text or image chat bubble. Outgoing bubbles align right on the primary
 * surface; incoming bubbles align left on a soft surface with the sender's name.
 * A footer shows the time plus the send status / read receipt for own messages.
 */
export function MessageBubble({
  message,
  isOwn,
  senderName,
  testID,
}: MessageBubbleProps) {
  const { t } = useTranslation();
  const seen = isOwn && message.senderId !== null
    ? isSeenByOthers(message, message.senderId)
    : false;

  return (
    <View
      style={[styles.row, isOwn ? styles.rowOwn : styles.rowOther]}
      testID={testID}
    >
      <View
        style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}
      >
        {!isOwn && senderName ? (
          <Text variant="label-s" color="primary" style={styles.sender}>
            {senderName}
          </Text>
        ) : null}

        {message.imageUrl ? (
          <Image
            source={{ uri: message.imageUrl }}
            style={styles.image}
            resizeMode="cover"
            accessibilityLabel={t("chat.imageMessage")}
          />
        ) : null}

        {message.text ? (
          <Text variant="body-m" color={isOwn ? "text-inverse" : "text"}>
            {message.text}
          </Text>
        ) : null}

        <View style={styles.footer}>
          <Text
            variant="overline"
            color={isOwn ? "text-inverse" : "text-subtle"}
          >
            {messageTime(message.createdAt)}
          </Text>
          {isOwn ? (
            <Text
              variant="overline"
              color={isOwn ? "text-inverse" : "text-subtle"}
              testID={testID ? `${testID}-status` : undefined}
            >
              {statusLabel(t, message, seen)}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

/** Footer status text for an outgoing message: sending / failed / seen / sent. */
const statusLabel = (
  t: TFunction,
  message: ChatMessage,
  seen: boolean,
): string => {
  if (message.status === "pending") return t("chat.status.sending");
  if (message.status === "failed") return t("chat.status.failed");
  if (seen) return t("chat.status.seen");
  return t("chat.status.sent");
};

const styles = StyleSheet.create({
  row: { flexDirection: "row", marginVertical: theme.spacing[4] },
  rowOwn: { justifyContent: "flex-end" },
  rowOther: { justifyContent: "flex-start" },
  bubble: {
    maxWidth: "78%",
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing[12],
    paddingVertical: theme.spacing[8],
    gap: theme.spacing[4],
  },
  bubbleOwn: {
    backgroundColor: theme.colors.primary,
    borderTopRightRadius: theme.radius.sm,
  },
  bubbleOther: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  sender: { marginBottom: theme.spacing[4] },
  image: {
    width: 200,
    height: 150,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors["surface-alt"],
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[8],
    alignSelf: "flex-end",
  },
});
