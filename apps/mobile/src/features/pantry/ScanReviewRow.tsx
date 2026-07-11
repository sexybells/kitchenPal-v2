import { Pressable, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { StockState } from "@kitchenpal/api-contract";
import { theme } from "../../theme";
import { Input, Icon, Badge } from "../../ui";
import { Segmented } from "./Segmented";
import { QuantityStepper } from "./QuantityStepper";
import { STOCK_STATES } from "./stock";

/** One editable detection/manual row in the scan review. */
export interface ReviewRow {
  key: string;
  name: string;
  category: string;
  quantity: number;
  /** Whether a numeric quantity is tracked (vs. assistive stock level only). */
  hasQuantity: boolean;
  unit: string | null;
  stockState: StockState;
  lowConfidence: boolean;
}

export interface ScanReviewRowProps {
  row: ReviewRow;
  onChange: (row: ReviewRow) => void;
  onRemove: () => void;
  testID?: string;
}

export function ScanReviewRow({ row, onChange, onRemove, testID }: ScanReviewRowProps) {
  const { t } = useTranslation();
  const stockOptions = STOCK_STATES.map((value) => ({
    value,
    label: t(`pantry.stock.${value}`),
  }));

  return (
    <View style={styles.card} testID={testID}>
      <View style={styles.topRow}>
        <View style={styles.nameField}>
          <Input
            placeholder={t("pantry.namePlaceholder")}
            value={row.name}
            onChangeText={(name) => onChange({ ...row, name })}
            testID={testID ? `${testID}-name` : undefined}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common.delete")}
          onPress={onRemove}
          hitSlop={8}
          style={styles.remove}
          testID={testID ? `${testID}-remove` : undefined}
        >
          <Icon name="close" size={20} color="text-muted" />
        </Pressable>
      </View>

      {row.lowConfidence ? (
        <Badge label={t("scan.lowConfidence")} tone="warning" />
      ) : null}

      {row.hasQuantity ? (
        <QuantityStepper
          value={row.quantity}
          onChange={(quantity) => onChange({ ...row, quantity })}
          unit={row.unit}
          testID={testID ? `${testID}-qty` : undefined}
        />
      ) : (
        <Segmented
          options={stockOptions}
          value={row.stockState}
          onChange={(stockState) => onChange({ ...row, stockState })}
          testID={testID ? `${testID}-stock` : undefined}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: theme.spacing[12],
    padding: theme.spacing[16],
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[8],
  },
  nameField: { flex: 1 },
  remove: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
});
