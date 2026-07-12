import { Pressable, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Card, Icon, Text } from "../../ui";
import { theme } from "../../theme";
import { messageTime } from "./labels";
import type { ChatMessage } from "./message-model";

export interface VoteCardProps {
  message: ChatMessage;
  currentUserId: string;
  onVote: (optionId: string) => void;
  testID?: string;
}

/**
 * A recipe vote poll: the question, each option with a live tally bar + count,
 * the caller's current choice highlighted. Tapping an option casts (or moves)
 * the caller's vote via `onVote`.
 */
export function VoteCard({
  message,
  currentUserId,
  onVote,
  testID,
}: VoteCardProps) {
  const { t } = useTranslation();
  const vote = message.vote;
  if (!vote) return null;

  const countFor = (optionId: string): number =>
    vote.tally.find((entry) => entry.optionId === optionId)?.count ?? 0;
  const votedFor = (optionId: string): boolean =>
    vote.tally
      .find((entry) => entry.optionId === optionId)
      ?.voterIds.includes(currentUserId) ?? false;
  const totalVotes = vote.tally.reduce((sum, entry) => sum + entry.count, 0);

  return (
    <Card background="surface" style={styles.card} testID={testID}>
      <View style={styles.header}>
        <Icon name="users" size={18} color="secondary" />
        <Text variant="label-s" color="secondary">
          {t("chat.card.poll")}
        </Text>
      </View>
      <Text variant="title" color="text">
        {vote.question}
      </Text>

      <View style={styles.options}>
        {vote.options.map((option) => {
          const count = countFor(option.id);
          const chosen = votedFor(option.id);
          const ratio = totalVotes > 0 ? count / totalVotes : 0;
          return (
            <Pressable
              key={option.id}
              accessibilityRole="button"
              accessibilityState={{ selected: chosen }}
              onPress={() => onVote(option.id)}
              style={styles.option}
              testID={testID ? `${testID}-option-${option.id}` : undefined}
            >
              <View style={styles.optionTrack}>
                <View
                  style={[
                    styles.optionFill,
                    {
                      width: `${Math.round(ratio * 100)}%`,
                      backgroundColor: chosen
                        ? theme.colors["primary-soft"]
                        : theme.colors["surface-sunken"],
                    },
                  ]}
                />
                <View style={styles.optionContent}>
                  <View style={styles.optionLabel}>
                    {chosen ? (
                      <Icon name="check" size={16} color="primary" />
                    ) : null}
                    <Text
                      variant="body-m"
                      color={chosen ? "primary" : "text"}
                      numberOfLines={1}
                    >
                      {option.label}
                    </Text>
                  </View>
                  <Text variant="label-s" color="text-muted">
                    {count}
                  </Text>
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.footer}>
        <Text variant="caption" color="text-subtle">
          {t("chat.card.voteCount", { count: totalVotes })}
        </Text>
        <Text variant="overline" color="text-subtle">
          {messageTime(message.createdAt)}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: theme.spacing[8], marginVertical: theme.spacing[4] },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[8],
  },
  options: { gap: theme.spacing[8], marginTop: theme.spacing[4] },
  option: { borderRadius: theme.radius.md, overflow: "hidden" },
  optionTrack: {
    minHeight: 40,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors["surface-alt"],
    justifyContent: "center",
    overflow: "hidden",
  },
  optionFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: theme.radius.md,
  },
  optionContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing[12],
    gap: theme.spacing[8],
  },
  optionLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[8],
    flex: 1,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: theme.spacing[4],
  },
});
