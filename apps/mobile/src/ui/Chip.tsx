import { Pressable, StyleSheet } from "react-native";
import { theme } from "../theme";
import { Text } from "./Text";
import { Icon, type IconName } from "./icons/Icon";

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
  testID?: string;
}

/** Filter/selection pill (Figma `cmp/chip`): full-radius, soft when idle. */
export function Chip({ label, selected = false, onPress, icon, testID }: ChipProps) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected ? styles.selected : styles.idle]}
    >
      {icon ? (
        <Icon
          name={icon}
          size={16}
          color={selected ? "text-inverse" : "text-muted"}
        />
      ) : null}
      <Text
        variant="label-s"
        color={selected ? "text-inverse" : "text-muted"}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[4],
    paddingHorizontal: theme.spacing[16],
    paddingVertical: theme.spacing[8],
    borderRadius: theme.radius.full,
    borderWidth: 1,
  },
  idle: {
    backgroundColor: theme.colors["surface-alt"],
    borderColor: theme.colors.border,
  },
  selected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
});
