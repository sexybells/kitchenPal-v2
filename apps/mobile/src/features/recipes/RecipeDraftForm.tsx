import { Pressable, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { MealType, RecipeDraft } from "@kitchenpal/api-contract";
import { Text, Input, Icon, Button } from "../../ui";
import { theme } from "../../theme";
import { Segmented } from "../pantry/Segmented";
import { MEAL_TYPES, mealTypeLabel } from "./labels";

/** Editable draft state — all numeric fields are strings while being typed. */
export interface DraftFormState {
  name: string;
  mealType: MealType;
  cookTimeMinutes: string;
  servings: string;
  imageUrl: string;
  ingredients: { name: string; quantity: string; unit: string }[];
  steps: string[];
  sourceUrl: string | null;
}

/** Blank draft used for manual entry. */
export const emptyDraftState = (): DraftFormState => ({
  name: "",
  mealType: "dinner",
  cookTimeMinutes: "",
  servings: "",
  imageUrl: "",
  ingredients: [{ name: "", quantity: "", unit: "" }],
  steps: [""],
  sourceUrl: null,
});

/** Seed the editable state from a parsed import draft. */
export const draftToState = (draft: RecipeDraft): DraftFormState => ({
  name: draft.name,
  mealType: draft.mealType,
  cookTimeMinutes: draft.cookTimeMinutes != null ? String(draft.cookTimeMinutes) : "",
  servings: draft.servings != null ? String(draft.servings) : "",
  imageUrl: draft.imageUrl ?? "",
  ingredients:
    draft.ingredients.length > 0
      ? draft.ingredients.map((item) => ({
          name: item.name,
          quantity: item.quantity != null ? String(item.quantity) : "",
          unit: item.unit ?? "",
        }))
      : [{ name: "", quantity: "", unit: "" }],
  steps: draft.steps.length > 0 ? [...draft.steps] : [""],
  sourceUrl: draft.sourceUrl ?? null,
});

const parseNumber = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

/** Build the validated-shape draft the API expects from the editable state. */
export const stateToDraft = (state: DraftFormState): RecipeDraft => ({
  name: state.name.trim(),
  mealType: state.mealType,
  tags: [],
  cookTimeMinutes: parseNumber(state.cookTimeMinutes),
  servings: parseNumber(state.servings),
  ingredients: state.ingredients
    .filter((item) => item.name.trim().length > 0)
    .map((item) => ({
      name: item.name.trim(),
      quantity: parseNumber(item.quantity),
      unit: item.unit.trim() || null,
      optional: false,
    })),
  steps: state.steps.map((step) => step.trim()).filter((step) => step.length > 0),
  imageUrl: state.imageUrl.trim() || null,
  sourceUrl: state.sourceUrl,
});

export interface RecipeDraftFormProps {
  value: DraftFormState;
  onChange: (next: DraftFormState) => void;
}

/**
 * Reviewable recipe form shared by URL-import (pre-filled draft) and manual
 * entry. Ingredient lines use plain fields; the parent owns submit.
 */
export function RecipeDraftForm({ value, onChange }: RecipeDraftFormProps) {
  const { t } = useTranslation();
  const patch = (partial: Partial<DraftFormState>) =>
    onChange({ ...value, ...partial });

  const setIngredient = (index: number, field: "name" | "quantity" | "unit", next: string) => {
    const ingredients = value.ingredients.map((item, i) =>
      i === index ? { ...item, [field]: next } : item,
    );
    patch({ ingredients });
  };

  return (
    <View style={styles.form}>
      <Input
        label={t("meals.draftName")}
        value={value.name}
        onChangeText={(name) => patch({ name })}
        testID="draft-name"
      />

      <View style={styles.field}>
        <Text variant="label-m" color="text">
          {t("meals.mealTypeLabel")}
        </Text>
        <Segmented
          options={MEAL_TYPES.map((mealType) => ({
            value: mealType,
            label: mealTypeLabel(t, mealType),
          }))}
          value={value.mealType}
          onChange={(mealType) => patch({ mealType })}
          testID="draft-mealtype"
        />
      </View>

      <View style={styles.pair}>
        <View style={styles.pairItem}>
          <Input
            label={t("meals.cookTime")}
            value={value.cookTimeMinutes}
            onChangeText={(cookTimeMinutes) => patch({ cookTimeMinutes })}
            keyboardType="number-pad"
            testID="draft-cooktime"
          />
        </View>
        <View style={styles.pairItem}>
          <Input
            label={t("meals.servings")}
            value={value.servings}
            onChangeText={(servings) => patch({ servings })}
            keyboardType="number-pad"
            testID="draft-servings"
          />
        </View>
      </View>

      <View style={styles.field}>
        <Text variant="label-m" color="text">
          {t("meals.ingredients")}
        </Text>
        {value.ingredients.map((item, index) => (
          <View key={index} style={styles.ingredientRow}>
            <View style={styles.ingredientName}>
              <Input
                placeholder={t("meals.ingredientName")}
                value={item.name}
                onChangeText={(next) => setIngredient(index, "name", next)}
                testID={`draft-ingredient-${index}`}
              />
            </View>
            <View style={styles.ingredientQty}>
              <Input
                placeholder={t("meals.qty")}
                value={item.quantity}
                onChangeText={(next) => setIngredient(index, "quantity", next)}
                keyboardType="numeric"
              />
            </View>
            <Pressable
              onPress={() =>
                patch({
                  ingredients: value.ingredients.filter((_, i) => i !== index),
                })
              }
              accessibilityRole="button"
              accessibilityLabel={t("common.delete")}
              hitSlop={8}
            >
              <Icon name="close" size={18} color="text-muted" />
            </Pressable>
          </View>
        ))}
        <Button
          label={t("meals.addIngredient")}
          variant="ghost"
          icon="plus"
          onPress={() =>
            patch({
              ingredients: [...value.ingredients, { name: "", quantity: "", unit: "" }],
            })
          }
          testID="draft-add-ingredient"
        />
      </View>

      <View style={styles.field}>
        <Text variant="label-m" color="text">
          {t("meals.steps")}
        </Text>
        {value.steps.map((step, index) => (
          <View key={index} style={styles.ingredientRow}>
            <View style={styles.ingredientName}>
              <Input
                placeholder={t("meals.stepPlaceholder", { number: index + 1 })}
                value={step}
                onChangeText={(next) =>
                  patch({
                    steps: value.steps.map((s, i) => (i === index ? next : s)),
                  })
                }
                multiline
                testID={`draft-step-${index}`}
              />
            </View>
            <Pressable
              onPress={() => patch({ steps: value.steps.filter((_, i) => i !== index) })}
              accessibilityRole="button"
              accessibilityLabel={t("common.delete")}
              hitSlop={8}
            >
              <Icon name="close" size={18} color="text-muted" />
            </Pressable>
          </View>
        ))}
        <Button
          label={t("meals.addStep")}
          variant="ghost"
          icon="plus"
          onPress={() => patch({ steps: [...value.steps, ""] })}
          testID="draft-add-step"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: theme.spacing[20] },
  field: { gap: theme.spacing[8] },
  pair: { flexDirection: "row", gap: theme.spacing[12] },
  pairItem: { flex: 1 },
  ingredientRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[8],
  },
  ingredientName: { flex: 3 },
  ingredientQty: { flex: 1 },
});
