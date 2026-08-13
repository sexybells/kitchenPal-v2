import { forwardRef, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, type Href } from "expo-router";
import { TabTrigger, type TabTriggerSlotProps } from "expo-router/ui";
import { useTranslation } from "react-i18next";
import { theme } from "../theme";
import { Text } from "./Text";
import { Icon, type IconName } from "./icons/Icon";
import { Fab } from "./Fab";

interface TabDef {
  name: string;
  href: Href;
  icon: IconName;
  labelKey:
    | "tabs.home"
    | "tabs.community"
    | "tabs.pantry"
    | "tabs.meals"
    | "tabs.shopping";
}

// Five evenly-spaced destinations sharing the full bar width. The Scan/Add FAB
// floats above the bar's trailing edge (see `BottomNav`) rather than sitting
// inline: with five tabs a centred inline FAB can't stay symmetric, and the
// 72px it used to reserve squeezed "Cộng đồng" onto two lines. Full-width tabs
// keep every label on a single line.
const TABS: readonly TabDef[] = [
  { name: "home", href: "/", icon: "home", labelKey: "tabs.home" },
  {
    name: "community",
    href: "/community",
    icon: "community",
    labelKey: "tabs.community",
  },
  { name: "pantry", href: "/pantry", icon: "pantry", labelKey: "tabs.pantry" },
  { name: "meals", href: "/meals", icon: "meals", labelKey: "tabs.meals" },
  {
    name: "shopping",
    href: "/shopping",
    icon: "shopping",
    labelKey: "tabs.shopping",
  },
];

interface NavButtonProps extends TabTriggerSlotProps {
  icon: IconName;
  label: string;
}

/** A single tab destination button, styled from the `isFocused` slot prop. */
const NavButton = forwardRef<View, NavButtonProps>(function NavButton(
  { icon, label, isFocused, ...pressableProps },
  ref,
) {
  const tone = isFocused ? "primary" : "text-subtle";
  return (
    <Pressable
      ref={ref}
      accessibilityState={{ selected: isFocused }}
      {...pressableProps}
      style={styles.tab}
    >
      <Icon name={icon} size={24} color={tone} strokeWidth={isFocused ? 2.1 : 1.8} />
      <Text variant="overline" color={tone} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
});

/**
 * Builds the tab destination elements as *literal* `<TabTrigger>` JSX.
 *
 * Expo Router's headless `<Tabs>` discovers its screens by statically walking
 * its own children for `<TabTrigger>`s inside a `<TabList>` — it never renders
 * custom components, so triggers hidden behind a component boundary are
 * invisible and the navigator throws "Couldn't find any screens". This hook is
 * therefore called by the tabs `_layout` (the same component that renders
 * `<Tabs>`) so the triggers it returns are literal descendants of `<TabList>`.
 */
export function useBottomNavTriggers() {
  const { t } = useTranslation();
  return TABS.map((tab) => (
    <TabTrigger key={tab.name} name={tab.name} href={tab.href} asChild>
      <NavButton icon={tab.icon} label={t(tab.labelKey)} />
    </TabTrigger>
  ));
}

/**
 * Bottom navigation shell: a row of five tab destinations with the Scan/Add FAB
 * floating just above the bar's trailing edge. Rendered as the `<TabList asChild>`
 * target. The FAB is not a tab — it routes to the scan/add modal.
 */
export function BottomNav({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom || theme.spacing[8] }]}>
      <View style={styles.fabWrapper} pointerEvents="box-none">
        <Fab
          testID="tab-fab"
          accessibilityLabel={t("tabs.add")}
          onPress={() => router.push("/scan")}
        />
      </View>
      <View style={styles.row}>{children}</View>
    </View>
  );
}

const FAB_SIZE = 60;

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: theme.spacing[8],
  },
  tab: {
    flex: 1,
    alignItems: "center",
    gap: theme.spacing[4],
  },
  // Float the FAB above the bar's trailing edge, clear of the last tab so it
  // never overlaps a label. Anchored to the container top (the bar's top edge).
  fabWrapper: {
    position: "absolute",
    right: theme.spacing[20],
    top: -(FAB_SIZE + theme.spacing[4]),
  },
});
