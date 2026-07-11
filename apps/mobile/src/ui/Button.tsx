import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { theme } from "../theme";
import { Text } from "./Text";
import { Icon, type IconName } from "./icons/Icon";

export type ButtonVariant = "primary" | "secondary" | "ghost";

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  icon?: IconName;
  fullWidth?: boolean;
  testID?: string;
  accessibilityLabel?: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Primary / secondary / ghost button. Presses drive a subtle Reanimated
 * scale, matching the tactile feel of the Figma `cmp/button-*` components.
 */
export function Button({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false,
  icon,
  fullWidth = true,
  testID,
  accessibilityLabel,
}: ButtonProps) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const isDisabled = disabled || loading;
  const palette = VARIANT_STYLES[variant];
  const contentColor = palette.textColor;

  return (
    <AnimatedPressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={onPress}
      onPressIn={() => {
        scale.value = withTiming(0.97, { duration: 90 });
      }}
      onPressOut={() => {
        scale.value = withTiming(1, { duration: 120 });
      }}
      style={[
        styles.base,
        palette.container,
        fullWidth ? styles.fullWidth : null,
        isDisabled ? styles.disabled : null,
        animatedStyle,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={theme.colors[contentColor]} />
      ) : (
        <View style={styles.content}>
          {icon ? <Icon name={icon} size={18} color={contentColor} /> : null}
          <Text variant="button" color={contentColor}>
            {label}
          </Text>
        </View>
      )}
    </AnimatedPressable>
  );
}

const VARIANT_STYLES = {
  primary: {
    container: { backgroundColor: theme.colors.primary },
    textColor: "text-inverse",
  },
  secondary: {
    container: {
      backgroundColor: theme.colors.surface,
      borderWidth: 1.5,
      borderColor: theme.colors["border-strong"],
    },
    textColor: "text",
  },
  ghost: {
    container: { backgroundColor: "transparent" },
    textColor: "primary",
  },
} as const;

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    borderRadius: theme.radius.lg,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing[20],
  },
  fullWidth: { alignSelf: "stretch" },
  disabled: { opacity: 0.5 },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[8],
  },
});
