import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Screen, Text, EmptyState } from "../../src/ui";
import { theme } from "../../src/theme";

/** Meals tab — foundation scaffold; plan/recipe data lands in a later phase. */
export default function MealsScreen() {
  const { t } = useTranslation();
  return (
    <Screen>
      <View style={styles.header}>
        <Text variant="heading-l" color="text">
          {t("tabs.meals")}
        </Text>
      </View>
      <View style={styles.body}>
        <EmptyState
          title={t("states.emptyTitle")}
          body={t("states.emptyBody")}
          icon="meals"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: theme.spacing[8] },
  body: { flex: 1, minHeight: 320 },
});
