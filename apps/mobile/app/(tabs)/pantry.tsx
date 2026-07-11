import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Screen, Text, Chip, EmptyState } from "../../src/ui";
import { theme } from "../../src/theme";

/** Pantry tab — foundation scaffold; item data lands in a later phase. */
export default function PantryScreen() {
  const { t } = useTranslation();
  return (
    <Screen>
      <View style={styles.header}>
        <Text variant="heading-l" color="text">
          {t("tabs.pantry")}
        </Text>
      </View>
      <View style={styles.filters}>
        <Chip label={t("tabs.pantry")} selected />
        <Chip label={t("home.expiringSoon")} />
      </View>
      <View style={styles.body}>
        <EmptyState
          title={t("states.emptyTitle")}
          body={t("states.emptyBody")}
          icon="pantry"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: theme.spacing[8] },
  filters: {
    flexDirection: "row",
    gap: theme.spacing[8],
    marginTop: theme.spacing[16],
  },
  body: { flex: 1, minHeight: 320 },
});
