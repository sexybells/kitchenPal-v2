import type { ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { theme, type ColorToken } from "../theme";

export interface CardProps {
  children: ReactNode;
  onPress?: () => void;
  background?: ColorToken;
  /** Apply the soft warm elevation shadow (default true). */
  elevated?: boolean;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
}

/** Rounded warm surface used for every content card (Figma card radius 18). */
export function Card({
  children,
  onPress,
  background = "surface",
  elevated = true,
  padded = true,
  style,
  testID,
  accessibilityLabel,
}: CardProps) {
  const content = [
    styles.card,
    { backgroundColor: theme.colors[background] },
    padded ? styles.padded : null,
    elevated ? theme.shadow.card : null,
    style,
  ];

  if (onPress) {
    return (
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={({ pressed }) => [content, pressed ? styles.pressed : null]}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <View testID={testID} style={content}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: theme.radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  padded: { padding: theme.spacing[16] },
  pressed: { opacity: 0.85 },
});
