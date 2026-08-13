import { View } from "react-native";
import { Tabs, TabSlot, TabList } from "expo-router/ui";
import { theme } from "../../src/theme";
import { BottomNav, useBottomNavTriggers } from "../../src/ui";

/**
 * Main app shell: the four tab destinations render into `TabSlot`, with the
 * custom `BottomNav` (Home · Pantry · [FAB] · Meals · Shopping) pinned below.
 *
 * The tab triggers MUST be literal children of `<TabList>` here — Expo Router's
 * headless `<Tabs>` discovers screens by statically walking its own JSX
 * children and never renders custom components, so the triggers are built by
 * `useBottomNavTriggers()` in this component and passed through `<TabList asChild>`
 * into the `BottomNav` shell. The FAB is not a tab — it opens the scan/add modal.
 */
export default function TabsLayout() {
  const triggers = useBottomNavTriggers();
  return (
    <Tabs>
      <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
        <TabSlot />
      </View>
      <TabList asChild>
        <BottomNav>{triggers}</BottomNav>
      </TabList>
    </Tabs>
  );
}
