import { Pressable, StyleSheet, View } from "react-native";
import { theme } from "../../theme";
import { Text, Icon } from "../../ui";

export interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string | null;
  testID?: string;
}

/**
 * Compact +/- quantity control used in the item form, scan review, and cook
 * flows. Clamps to `[min, max]`. The decrement glyph is a drawn line (there is
 * no minus icon in the set); the increment reuses the `plus` line icon.
 */
export function QuantityStepper({
  value,
  onChange,
  min = 0,
  max = 1_000_000,
  step = 1,
  unit,
  testID,
}: QuantityStepperProps) {
  const clamp = (next: number) => Math.min(max, Math.max(min, next));
  const decrement = () => onChange(clamp(value - step));
  const increment = () => onChange(clamp(value + step));

  return (
    <View style={styles.row} testID={testID}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="decrement"
        onPress={decrement}
        disabled={value <= min}
        style={[styles.button, value <= min ? styles.disabled : null]}
        testID={testID ? `${testID}-dec` : undefined}
      >
        <View style={styles.minus} />
      </Pressable>
      <View style={styles.valueBlock}>
        <Text variant="title" color="text" testID={testID ? `${testID}-value` : undefined}>
          {formatQuantity(value)}
        </Text>
        {unit ? (
          <Text variant="caption" color="text-muted">
            {unit}
          </Text>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="increment"
        onPress={increment}
        disabled={value >= max}
        style={[styles.button, value >= max ? styles.disabled : null]}
        testID={testID ? `${testID}-inc` : undefined}
      >
        <Icon name="plus" size={18} color="text" />
      </Pressable>
    </View>
  );
}

/** Trim trailing zeros so 2.0 shows as "2" but 1.5 stays "1.5". */
const formatQuantity = (value: number): string =>
  Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[12],
  },
  button: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors["surface-alt"],
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  disabled: { opacity: 0.4 },
  minus: {
    width: 14,
    height: 2,
    borderRadius: 1,
    backgroundColor: theme.colors.text,
  },
  valueBlock: {
    minWidth: 56,
    alignItems: "center",
    gap: theme.spacing[4],
  },
});
