import { Pressable, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { ShoppingItem } from "@kitchenpal/api-contract";
import { Text, Icon, Badge } from "../../ui";
import { theme } from "../../theme";

/** Format an item's quantity + unit into a compact "2 kg" style label. */
const amountLabel = (item: ShoppingItem): string | null => {
  const parts = [item.quantity ?? null, item.unit ?? null].filter(
    (part): part is string | number => part !== null && part !== "",
  );
  return parts.length > 0 ? parts.join(" ") : null;
};

export interface ShoppingItemRowProps {
  item: ShoppingItem;
  onToggle: () => void;
  onRemove?: () => void;
  disabled?: boolean;
  testID?: string;
}

/**
 * One checklist line: a tappable checkbox that toggles `bought`, the item name +
 * amount, a "từ công thức" tag when the line came from a recipe, and a remove
 * action. A line icon sits in the checkbox per the ingredient rendering rule.
 */
export function ShoppingItemRow({
  item,
  onToggle,
  onRemove,
  disabled = false,
  testID,
}: ShoppingItemRowProps) {
  const { t } = useTranslation();
  const amount = amountLabel(item);

  return (
    <View style={styles.row} testID={testID}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.bought, disabled }}
        accessibilityLabel={item.name}
        onPress={onToggle}
        disabled={disabled}
        hitSlop={8}
        style={[styles.checkbox, item.bought ? styles.checkboxOn : null]}
        testID={testID ? `${testID}-toggle` : undefined}
      >
        {item.bought ? <Icon name="check" size={16} color="text-inverse" /> : null}
      </Pressable>

      <View style={styles.body}>
        <Text
          variant="body-l"
          color={item.bought ? "text-subtle" : "text"}
          numberOfLines={1}
          style={item.bought ? styles.struck : undefined}
        >
          {item.name}
        </Text>
        <View style={styles.metaRow}>
          {amount ? (
            <Text variant="body-m" color="text-muted">
              {amount}
            </Text>
          ) : null}
          {item.sourceRecipeId ? (
            <Badge label={t("shopping.fromRecipe")} tone="primary" />
          ) : null}
        </View>
      </View>

      {onRemove ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common.delete")}
          onPress={onRemove}
          disabled={disabled}
          hitSlop={8}
          testID={testID ? `${testID}-remove` : undefined}
        >
          <Icon name="close" size={18} color="text-subtle" />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[12],
    paddingVertical: theme.spacing[12],
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: theme.radius.sm,
    borderWidth: 2,
    borderColor: theme.colors["border-strong"],
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  body: { flex: 1, gap: theme.spacing[4] },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[8],
    flexWrap: "wrap",
  },
  struck: { textDecorationLine: "line-through" },
});
