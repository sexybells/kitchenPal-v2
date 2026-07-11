import { StyleSheet, View } from "react-native";
import { theme, type ColorToken } from "../theme";
import { Text } from "./Text";

export type BadgeTone = "neutral" | "primary" | "success" | "warning" | "danger" | "info";

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  testID?: string;
}

// Each tone maps to a soft-tint background + a strong-color label.
const TONES: Record<BadgeTone, { bg: ColorToken; fg: ColorToken }> = {
  neutral: { bg: "surface-sunken", fg: "text-muted" },
  primary: { bg: "primary-soft", fg: "primary" },
  success: { bg: "success-soft", fg: "success" },
  warning: { bg: "warning-soft", fg: "warning" },
  danger: { bg: "danger-soft", fg: "danger" },
  info: { bg: "info-soft", fg: "info" },
};

/** Compact status label — e.g. "Expiring soon", stock state, unread count. */
export function Badge({ label, tone = "neutral", testID }: BadgeProps) {
  const palette = TONES[tone];
  return (
    <View
      testID={testID}
      style={[styles.badge, { backgroundColor: theme.colors[palette.bg] }]}
    >
      <Text variant="overline" color={palette.fg}>
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: theme.spacing[8],
    paddingVertical: theme.spacing[4],
    borderRadius: theme.radius.full,
  },
});
