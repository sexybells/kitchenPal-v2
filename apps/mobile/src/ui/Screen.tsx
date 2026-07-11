import type { ReactNode } from "react";
import {
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { theme, type ColorToken } from "../theme";

export interface ScreenProps {
  children: ReactNode;
  /** Wrap content in a vertical ScrollView (default true). */
  scroll?: boolean;
  /** Background surface token. */
  background?: ColorToken;
  /** Safe-area edges to inset. */
  edges?: readonly Edge[];
  /** Apply the standard horizontal gutter (default true). */
  padded?: boolean;
  /** Fixed element pinned to the bottom (e.g. a primary action bar). */
  footer?: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Safe-area screen scaffold: warm background, status-bar handling, optional
 * scroll, standard gutters, and an optional pinned footer.
 */
export function Screen({
  children,
  scroll = true,
  background = "bg",
  edges = ["top", "left", "right"],
  padded = true,
  footer,
  contentStyle,
  testID,
}: ScreenProps) {
  const gutter = padded ? { paddingHorizontal: theme.spacing[20] } : null;
  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[styles.scrollContent, gutter, contentStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, gutter, contentStyle]}>{children}</View>
  );

  return (
    <SafeAreaView
      edges={edges}
      style={[styles.flex, { backgroundColor: theme.colors[background] }]}
      testID={testID}
    >
      <StatusBar style="dark" />
      {body}
      {footer ? (
        <View style={[styles.footer, padded ? styles.footerPadded : null]}>
          {footer}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: {
    paddingTop: theme.spacing[8],
    paddingBottom: theme.spacing[32],
    flexGrow: 1,
  },
  footer: {
    paddingVertical: theme.spacing[12],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  footerPadded: { paddingHorizontal: theme.spacing[20] },
});
