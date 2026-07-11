import { View } from "react-native";
import { Tabs, TabSlot } from "expo-router/ui";
import { theme } from "../../src/theme";
import { BottomNav } from "../../src/ui";

/**
 * Main app shell: the four tab destinations render into `TabSlot`, with the
 * custom `BottomNav` (Home · Pantry · [FAB] · Meals · Shopping) pinned below.
 * The FAB is not a tab — it opens the scan/add modal.
 */
export default function TabsLayout() {
  return (
    <Tabs>
      <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
        <TabSlot />
      </View>
      <BottomNav />
    </Tabs>
  );
}
