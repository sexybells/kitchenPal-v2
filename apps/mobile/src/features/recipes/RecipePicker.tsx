import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Text, Icon, ListRow, LoadingState, EmptyState } from "../../ui";
import { theme } from "../../theme";
import { useRecipeList } from "./hooks";
import { dishPlaceholder } from "./dish-placeholder";

export interface RecipePickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (recipeId: string) => void;
}

/**
 * Bottom-sheet modal to pick one of the caller's recipes for a meal slot. Reuses
 * the recipe list query so the picker stays in sync with the library.
 */
export function RecipePicker({ visible, onClose, onSelect }: RecipePickerProps) {
  const { t } = useTranslation();
  const recipes = useRecipeList("mine");

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" />
      <View style={styles.sheet} testID="recipe-picker">
        <View style={styles.header}>
          <Text variant="heading-s" color="text">
            {t("meals.pickRecipe")}
          </Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t("common.close")}
            hitSlop={8}
          >
            <Icon name="close" size={22} color="text-muted" />
          </Pressable>
        </View>

        {recipes.isLoading ? (
          <LoadingState label={t("common.loading")} />
        ) : (recipes.data ?? []).length === 0 ? (
          <EmptyState
            title={t("meals.recipesEmptyTitle")}
            body={t("meals.recipesEmptyBody")}
            icon="meals"
          />
        ) : (
          <ScrollView contentContainerStyle={styles.list}>
            {(recipes.data ?? []).map((recipe) => (
              <ListRow
                key={recipe.id}
                title={recipe.name}
                leading={
                  <Text variant="heading-s">
                    {dishPlaceholder(recipe.name, recipe.mealType).emoji}
                  </Text>
                }
                onPress={() => onSelect(recipe.id)}
                testID={`recipe-pick-${recipe.id}`}
              />
            ))}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(43, 36, 32, 0.4)" },
  sheet: {
    maxHeight: "70%",
    backgroundColor: theme.colors.bg,
    borderTopLeftRadius: theme.radius["2xl"],
    borderTopRightRadius: theme.radius["2xl"],
    padding: theme.spacing[20],
    gap: theme.spacing[12],
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  list: { gap: theme.spacing[8], paddingBottom: theme.spacing[16] },
});
