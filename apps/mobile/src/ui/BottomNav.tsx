import { forwardRef } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, type Href } from "expo-router";
import { TabList, TabTrigger, type TabTriggerSlotProps } from "expo-router/ui";
import { useTranslation } from "react-i18next";
import { theme } from "../theme";
import { Text } from "./Text";
import { Icon, type IconName } from "./icons/Icon";
import { Fab } from "./Fab";

interface TabDef {
  name: string;
  href: Href;
  icon: IconName;
  labelKey: "tabs.home" | "tabs.pantry" | "tabs.meals" | "tabs.shopping";
}

// Two destinations either side of the center FAB, matching the Figma IA.
const LEFT_TABS: readonly TabDef[] = [
  { name: "home", href: "/", icon: "home", labelKey: "tabs.home" },
  { name: "pantry", href: "/pantry", icon: "pantry", labelKey: "tabs.pantry" },
];
const RIGHT_TABS: readonly TabDef[] = [
  { name: "meals", href: "/meals", icon: "meals", labelKey: "tabs.meals" },
  { name: "shopping", href: "/shopping", icon: "shopping", labelKey: "tabs.shopping" },
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
      <Text variant="overline" color={tone}>
        {label}
      </Text>
    </Pressable>
  );
});

/**
 * Bottom navigation with a floating center FAB (Scan/Add). Built on the
 * headless Expo Router tabs so the FAB can sit above the bar without being a
 * tab itself — it routes to the scan/add modal.
 */
export function BottomNav() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();

  const renderTab = (tab: TabDef) => (
    <TabTrigger key={tab.name} name={tab.name} href={tab.href} asChild>
      <NavButton icon={tab.icon} label={t(tab.labelKey)} />
    </TabTrigger>
  );

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom || theme.spacing[8] }]}>
      <TabList asChild>
        <View style={styles.row}>
          {LEFT_TABS.map(renderTab)}
          <View style={styles.fabSlot} />
          {RIGHT_TABS.map(renderTab)}
        </View>
      </TabList>
      <View style={styles.fabWrapper} pointerEvents="box-none">
        <Fab
          testID="tab-fab"
          accessibilityLabel={t("tabs.add")}
          onPress={() => router.push("/scan")}
        />
      </View>
    </View>
  );
}

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
  fabSlot: { width: 72 },
  fabWrapper: {
    position: "absolute",
    top: -22,
    left: 0,
    right: 0,
    alignItems: "center",
  },
});
