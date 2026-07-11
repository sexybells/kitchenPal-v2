import { Switch } from "react-native";
import { theme } from "../theme";

export interface ToggleProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}

/** Themed switch wrapper (warm track/thumb colors). */
export function Toggle({
  value,
  onValueChange,
  disabled = false,
  accessibilityLabel,
  testID,
}: ToggleProps) {
  return (
    <Switch
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      trackColor={{
        false: theme.colors["surface-sunken"],
        true: theme.colors.primary,
      }}
      thumbColor={theme.colors.surface}
      ios_backgroundColor={theme.colors["surface-sunken"]}
    />
  );
}
