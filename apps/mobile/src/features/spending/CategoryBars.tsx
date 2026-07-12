import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { ExpenseCategory } from "@kitchenpal/api-contract";
import { Text } from "../../ui";
import { theme } from "../../theme";
import { formatVnd } from "../../lib/currency";
import { buildCategoryBreakdown } from "./analytics";
import { categoryColor, categoryLabel } from "./labels";

export interface CategoryBarsProps {
  byCategory: readonly { category: ExpenseCategory; total: number }[];
  testID?: string;
}

/**
 * Horizontal proportion bars, one per spending category, widest first. Bars are
 * plain views (no SVG needed) sized by each category's share of the total — the
 * scaling logic lives in `buildCategoryBreakdown` so it stays testable.
 */
export function CategoryBars({ byCategory, testID }: CategoryBarsProps) {
  const { t } = useTranslation();
  const slices = buildCategoryBreakdown(byCategory);

  if (slices.length === 0) {
    return (
      <Text variant="body-m" color="text-muted" testID={testID}>
        {t("spending.noSpendYet")}
      </Text>
    );
  }

  return (
    <View style={styles.wrap} testID={testID}>
      {slices.map((slice) => (
        <View key={slice.category} style={styles.row}>
          <View style={styles.labelRow}>
            <Text variant="label-m" color="text">
              {categoryLabel(t, slice.category)}
            </Text>
            <Text variant="body-m" color="text-muted">
              {formatVnd(slice.total)}
            </Text>
          </View>
          <View style={styles.track}>
            <View
              style={[
                styles.fill,
                {
                  backgroundColor: theme.colors[categoryColor(slice.category)],
                  width: `${Math.max(4, Math.round(slice.ratio * 100))}%`,
                },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: theme.spacing[16] },
  row: { gap: theme.spacing[8] },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  track: {
    height: 10,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors["surface-sunken"],
    overflow: "hidden",
  },
  fill: { height: "100%", borderRadius: theme.radius.full },
});
