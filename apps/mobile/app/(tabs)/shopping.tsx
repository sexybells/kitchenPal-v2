import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Screen, Text, EmptyState } from "../../src/ui";
import { theme } from "../../src/theme";

/** Shopping tab — foundation scaffold; checklist data lands in a later phase. */
export default function ShoppingScreen() {
  const { t } = useTranslation();
  return (
    <Screen>
      <View style={styles.header}>
        <Text variant="heading-l" color="text">
          {t("tabs.shopping")}
        </Text>
      </View>
      <View style={styles.body}>
        <EmptyState
          title={t("states.emptyTitle")}
          body={t("states.emptyBody")}
          icon="shopping"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: theme.spacing[8] },
  body: { flex: 1, minHeight: 320 },
});
