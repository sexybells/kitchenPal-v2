import { Image, StyleSheet, View } from "react-native";
import { theme } from "../theme";
import { Text } from "./Text";

export interface AvatarProps {
  name: string;
  uri?: string | null;
  size?: number;
  testID?: string;
}

/** Derive up to two initials from a display name. */
const initialsOf = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

/** Circular avatar: photo when available, otherwise initials on a soft tint. */
export function Avatar({ name, uri, size = 44, testID }: AvatarProps) {
  const dimension = { width: size, height: size, borderRadius: size / 2 };

  if (uri) {
    return (
      <Image
        testID={testID}
        source={{ uri }}
        accessibilityLabel={name}
        style={[styles.image, dimension]}
      />
    );
  }

  return (
    <View testID={testID} style={[styles.fallback, dimension]}>
      <Text variant="label-m" color="primary">
        {initialsOf(name) || "?"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: { backgroundColor: theme.colors["surface-alt"] },
  fallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors["primary-soft"],
  },
});
