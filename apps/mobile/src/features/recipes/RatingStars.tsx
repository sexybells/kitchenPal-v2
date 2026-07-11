import { Pressable, StyleSheet, View } from "react-native";
import { Icon } from "../../ui";
import { theme } from "../../theme";
import { starFill } from "./labels";

export interface RatingStarsProps {
  /** Current rating, 0..5. */
  value: number;
  size?: number;
  /** When set, stars become tappable to pick a 1..5 rating. */
  onChange?: (rating: number) => void;
  testID?: string;
}

/**
 * Row of five stars. Read-only by default; pass `onChange` to make it an input
 * (one tap = that many stars). Colors come from the accent/border tokens.
 */
export function RatingStars({ value, size = 18, onChange, testID }: RatingStarsProps) {
  const fills = starFill(value);
  return (
    <View style={styles.row} testID={testID} accessibilityRole="adjustable">
      {fills.map((filled, index) => {
        const position = index + 1;
        const star = (
          <Icon
            name={filled ? "star-filled" : "star"}
            size={size}
            color={filled ? "accent" : "border-strong"}
          />
        );
        if (!onChange) return <View key={position}>{star}</View>;
        return (
          <Pressable
            key={position}
            accessibilityRole="button"
            accessibilityLabel={String(position)}
            onPress={() => onChange(position)}
            hitSlop={6}
            testID={testID ? `${testID}-${position}` : undefined}
          >
            {star}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: theme.spacing[4] },
});
