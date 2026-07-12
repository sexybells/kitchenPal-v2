import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Text } from "../../ui";
import { theme } from "../../theme";

export interface TypingIndicatorProps {
  /** Ids of members currently typing. Renders nothing when empty. */
  userIds: string[];
  testID?: string;
}

/**
 * A subtle "someone is typing" hint. Driven purely by received `typing` socket
 * events, so it only appears on real peer activity — never faked with timers.
 */
export function TypingIndicator({ userIds, testID }: TypingIndicatorProps) {
  const { t } = useTranslation();
  if (userIds.length === 0) return null;

  return (
    <View style={styles.row} testID={testID}>
      <Text variant="caption" color="text-muted">
        {t("chat.typing", { count: userIds.length })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: theme.spacing[4], paddingHorizontal: theme.spacing[4] },
});
