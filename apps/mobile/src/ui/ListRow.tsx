import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { theme, type ColorToken } from "../theme";
import { Text } from "./Text";
import { Icon, type IconName } from "./icons/Icon";

export interface ListRowProps {
  title: string;
  subtitle?: string;
  /** Leading line icon shown in a soft-tinted circle (ingredient rule). */
  leadingIcon?: IconName;
  leadingTone?: ColorToken;
  /** Custom leading node (e.g. an Avatar) — overrides `leadingIcon`. */
  leading?: ReactNode;
  /** Trailing content; defaults to a chevron when `onPress` is set. */
  trailing?: ReactNode;
  onPress?: () => void;
  testID?: string;
}

/**
 * Generic list row for pantry items, meals, settings, etc. A leading line icon
 * sits in a soft-tinted circle — the design convention for ingredients.
 */
export function ListRow({
  title,
  subtitle,
  leadingIcon,
  leadingTone = "secondary",
  leading,
  trailing,
  onPress,
  testID,
}: ListRowProps) {
  const showChevron = trailing === undefined && onPress !== undefined;

  const body = (
    <>
      {leading ??
        (leadingIcon ? (
          <View
            style={[
              styles.iconCircle,
              { backgroundColor: theme.colors[softToneOf(leadingTone)] },
            ]}
          >
            <Icon name={leadingIcon} size={20} color={leadingTone} />
          </View>
        ) : null)}
      <View style={styles.textBlock}>
        <Text variant="title" color="text" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="body-m" color="text-muted" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ??
        (showChevron ? (
          <Icon name="chevron-right" size={20} color="text-subtle" />
        ) : null)}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        testID={testID}
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
      >
        {body}
      </Pressable>
    );
  }
  return (
    <View testID={testID} style={styles.row}>
      {body}
    </View>
  );
}

/** Map a base color token to its `-soft` tint for the icon circle. */
const softToneOf = (tone: ColorToken): ColorToken => {
  const soft = `${tone}-soft` as ColorToken;
  return soft in theme.colors ? soft : "surface-alt";
};

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[12],
    paddingVertical: theme.spacing[12],
  },
  pressed: { opacity: 0.7 },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  textBlock: { flex: 1, gap: theme.spacing[4] },
});
