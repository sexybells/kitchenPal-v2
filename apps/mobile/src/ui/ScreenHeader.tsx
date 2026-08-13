import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { theme } from "../theme";
import { Text } from "./Text";
import { Icon } from "./icons/Icon";

export interface ScreenHeaderProps {
  /** The screen title, rendered as the standard `heading-l`. */
  title: string;
  /**
   * When provided, a leading back affordance (chevron) is shown and calls this
   * on press — used by pushed sub-screens, which have no native header because
   * the stack runs with `headerShown: false`.
   */
  onBack?: () => void;
  /** Optional trailing slot (action button, badge…) pinned to the right. */
  right?: ReactNode;
  testID?: string;
}

/**
 * The standard titled screen header: an optional back chevron, a `heading-l`
 * title, and an optional action slot on the right, spaced to match the Figma IA.
 * Extracted so every screen shares one spacing/typography contract instead of
 * re-declaring the same row. The Home tab intentionally opts out — it shows a
 * greeting block, not a titled header.
 */
export function ScreenHeader({ title, onBack, right, testID }: ScreenHeaderProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.header} testID={testID}>
      <View style={styles.leading}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel={t("common.back")}
            hitSlop={8}
            style={styles.back}
            testID="screen-header-back"
          >
            <Icon name="chevron-left" size={24} color="text" />
          </Pressable>
        ) : null}
        <Text variant="heading-l" color="text" numberOfLines={1} style={styles.title}>
          {title}
        </Text>
      </View>
      {right ?? null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: theme.spacing[8],
    marginBottom: theme.spacing[16],
    gap: theme.spacing[8],
  },
  // Groups the optional back chevron with the title so the title can shrink and
  // ellipsize without pushing the trailing action off-screen.
  leading: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[8],
    flexShrink: 1,
  },
  back: {
    marginLeft: -theme.spacing[4],
  },
  title: { flexShrink: 1 },
});
