import { Pressable, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { Text, Icon } from "../../ui";
import { theme } from "../../theme";

export interface LikeButtonProps {
  liked: boolean;
  count: number;
  onPress: () => void;
  testID?: string;
}

/** Heart toggle with a like count; the heart fills when the caller has liked. */
export function LikeButton({ liked, count, onPress, testID }: LikeButtonProps) {
  const { t } = useTranslation();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t("community.like")}
      accessibilityState={{ selected: liked }}
      hitSlop={8}
      style={styles.button}
      testID={testID}
    >
      <Icon
        name={liked ? "heart-filled" : "heart"}
        size={20}
        color={liked ? "primary" : "text-muted"}
      />
      <Text variant="label-s" color={liked ? "primary" : "text-muted"}>
        {t("community.likeCount", { count })}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[4],
  },
});
