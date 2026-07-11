import { Pressable, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { MealPlanSlot } from "@kitchenpal/api-contract";
import { Card, Text, Icon } from "../../ui";
import { theme } from "../../theme";
import { dishEmoji, mealTypeLabel } from "./labels";

export interface MealSlotCardProps {
  slot: MealPlanSlot;
  /** Open the assigned recipe's detail (filled slots only). */
  onOpen: () => void;
  /** Pick a recipe for an empty slot. */
  onAssign: () => void;
  /** Clear the assigned recipe from a filled slot. */
  onClear: () => void;
  busy?: boolean;
  testID?: string;
}

/**
 * One day×mealType slot in the weekly planner. Empty slots show an "add"
 * affordance; filled slots show the recipe with a clear button.
 */
export function MealSlotCard({
  slot,
  onOpen,
  onAssign,
  onClear,
  busy = false,
  testID,
}: MealSlotCardProps) {
  const { t } = useTranslation();
  const filled = slot.recipeId !== null;

  return (
    <View style={styles.wrap} testID={testID}>
      <Text variant="label-s" color="text-muted">
        {mealTypeLabel(t, slot.mealType)}
      </Text>
      {filled ? (
        <Card onPress={onOpen} padded testID={testID ? `${testID}-filled` : undefined}>
          <View style={styles.row}>
            <Text variant="heading-s">{dishEmoji(slot.mealType)}</Text>
            <Text
              variant="title"
              color="text"
              numberOfLines={1}
              style={styles.name}
            >
              {slot.recipeName ?? t("meals.unknownRecipe")}
            </Text>
            <Pressable
              onPress={onClear}
              accessibilityRole="button"
              accessibilityLabel={t("meals.clearSlot")}
              disabled={busy}
              hitSlop={8}
              testID={testID ? `${testID}-clear` : undefined}
            >
              <Icon name="close" size={18} color="text-muted" />
            </Pressable>
          </View>
        </Card>
      ) : (
        <Pressable
          onPress={onAssign}
          accessibilityRole="button"
          accessibilityLabel={t("meals.addToSlot")}
          disabled={busy}
          style={styles.empty}
          testID={testID ? `${testID}-add` : undefined}
        >
          <Icon name="plus" size={18} color="text-muted" />
          <Text variant="body-m" color="text-muted">
            {t("meals.addToSlot")}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: theme.spacing[4] },
  row: { flexDirection: "row", alignItems: "center", gap: theme.spacing[12] },
  name: { flex: 1 },
  empty: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[8],
    paddingVertical: theme.spacing[16],
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: theme.colors["border-strong"],
    backgroundColor: theme.colors["surface-alt"],
  },
});
