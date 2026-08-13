import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Screen, ScreenHeader } from "../../src/ui";
import { theme } from "../../src/theme";
import { Segmented } from "../../src/features/pantry/Segmented";
import { MealPlanner } from "../../src/features/recipes/MealPlanner";
import { RecipesBrowser } from "../../src/features/recipes/RecipesBrowser";

type MealsTab = "plan" | "recipes";

/**
 * Meals tab: segmented weekly planner ("Kế hoạch") and recipe browser
 * ("Công thức"). Both open the shared recipe detail; the browser also routes to
 * import. The screen scrolls; each pane manages its own horizontal filters.
 */
export default function MealsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [tab, setTab] = useState<MealsTab>("plan");

  const openRecipe = (id: string) => router.push(`/recipe?id=${id}`);

  return (
    <Screen testID="meals-screen">
      <ScreenHeader title={t("tabs.meals")} />

      <View style={styles.segmented}>
        <Segmented<MealsTab>
          options={[
            { value: "plan", label: t("meals.tabPlan") },
            { value: "recipes", label: t("meals.tabRecipes") },
          ]}
          value={tab}
          onChange={setTab}
          testID="meals-tab"
        />
      </View>

      {tab === "plan" ? (
        <MealPlanner onOpenRecipe={openRecipe} />
      ) : (
        <RecipesBrowser
          onOpenRecipe={openRecipe}
          onImport={() => router.push("/recipe-import")}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  segmented: { marginBottom: theme.spacing[16] },
});
