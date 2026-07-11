import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import type {
  PantryMatchIngredient,
  RecipeIngredient,
} from "@kitchenpal/api-contract";
import { Text, Icon } from "../../ui";
import { theme } from "../../theme";

/** Format an ingredient's quantity + unit + name into one line. */
const formatLine = (
  ingredient: Pick<PantryMatchIngredient, "name" | "quantity" | "unit">,
): string => {
  const amount = [ingredient.quantity ?? null, ingredient.unit ?? null]
    .filter((part): part is string | number => part !== null && part !== "")
    .join(" ");
  return amount ? `${amount} · ${ingredient.name}` : ingredient.name;
};

export interface IngredientChecklistProps {
  available: PantryMatchIngredient[];
  needed: PantryMatchIngredient[];
  testID?: string;
}

/**
 * Ingredients split by pantry-match into "có sẵn" (on hand) and "cần mua"
 * (to buy). Each line uses a line icon per the ingredient rendering rule — no
 * raw-food emoji.
 */
export function IngredientChecklist({
  available,
  needed,
  testID,
}: IngredientChecklistProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.wrap} testID={testID}>
      <Group
        title={t("meals.available", { count: available.length })}
        items={available}
        tone="available"
        testID={testID ? `${testID}-available` : undefined}
      />
      <Group
        title={t("meals.needed", { count: needed.length })}
        items={needed}
        tone="needed"
        testID={testID ? `${testID}-needed` : undefined}
      />
    </View>
  );
}

function Group({
  title,
  items,
  tone,
  testID,
}: {
  title: string;
  items: PantryMatchIngredient[];
  tone: "available" | "needed";
  testID?: string;
}) {
  const { t } = useTranslation();
  const isAvailable = tone === "available";
  return (
    <View style={styles.group} testID={testID}>
      <Text variant="label-m" color={isAvailable ? "success" : "warning"}>
        {title}
      </Text>
      {items.length === 0 ? (
        <Text variant="body-m" color="text-muted">
          {isAvailable ? t("meals.nothingOnHand") : t("meals.nothingNeeded")}
        </Text>
      ) : (
        items.map((item, index) => (
          <View key={`${item.name}-${index}`} style={styles.line}>
            <Icon
              name={isAvailable ? "check" : "leaf"}
              size={18}
              color={isAvailable ? "success" : "text-muted"}
            />
            <Text variant="body-l" color="text" style={styles.lineText}>
              {formatLine(item)}
            </Text>
            {item.optional ? (
              <Text variant="label-s" color="text-subtle">
                {t("meals.optional")}
              </Text>
            ) : null}
          </View>
        ))
      )}
    </View>
  );
}

/** Plain ingredient list shown before/without a pantry match (no pantry state). */
export function IngredientList({
  ingredients,
  testID,
}: {
  ingredients: RecipeIngredient[];
  testID?: string;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.group} testID={testID}>
      {ingredients.map((item, index) => (
        <View key={`${item.name}-${index}`} style={styles.line}>
          <Icon name="leaf" size={18} color="text-muted" />
          <Text variant="body-l" color="text" style={styles.lineText}>
            {formatLine({
              name: item.name,
              quantity: item.quantity ?? null,
              unit: item.unit ?? null,
            })}
          </Text>
          {item.optional ? (
            <Text variant="label-s" color="text-subtle">
              {t("meals.optional")}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: theme.spacing[20] },
  group: { gap: theme.spacing[8] },
  line: { flexDirection: "row", alignItems: "center", gap: theme.spacing[8] },
  lineText: { flex: 1 },
});
