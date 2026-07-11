import { StyleSheet, View } from "react-native";
import { Chip } from "../../ui";
import { theme } from "../../theme";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  testID?: string;
}

/**
 * A wrapping row of selectable chips — used for stock level, tracking mode, and
 * category selection. Builds on the shared `Chip` so styling stays consistent.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  testID,
}: SegmentedProps<T>) {
  return (
    <View style={styles.row} testID={testID}>
      {options.map((option) => (
        <Chip
          key={option.value}
          label={option.label}
          selected={option.value === value}
          onPress={() => onChange(option.value)}
          testID={testID ? `${testID}-${option.value}` : undefined}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[8],
  },
});
