import { Pressable, StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { theme } from "../theme";
import { Icon, type IconName } from "./icons/Icon";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface FabProps {
  onPress?: () => void;
  icon?: IconName;
  size?: number;
  accessibilityLabel?: string;
  testID?: string;
}

/**
 * Center floating action button for the bottom nav (Scan/Add). Presses drive a
 * springy Reanimated scale for a tactile feel.
 */
export function Fab({
  onPress,
  icon = "plus",
  size = 60,
  accessibilityLabel = "Add",
  testID,
}: FabProps) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      onPressIn={() => {
        scale.value = withSpring(0.9, { damping: 12, stiffness: 220 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 10, stiffness: 200 });
      }}
      style={[
        styles.fab,
        { width: size, height: size, borderRadius: size / 2 },
        theme.shadow.card,
        animatedStyle,
      ]}
    >
      <Icon name={icon} size={28} color="text-inverse" strokeWidth={2.2} />
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primary,
  },
});
