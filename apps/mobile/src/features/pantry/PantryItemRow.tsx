import { Pressable, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { PantryItemResponse } from "@kitchenpal/api-contract";
import { theme } from "../../theme";
import { Text, Icon, Badge } from "../../ui";
import { StockPill } from "./StockPill";
import { EXPIRY_TONE, expiryInfo } from "./stock";

export interface PantryItemRowProps {
  item: PantryItemResponse;
  onPress?: () => void;
  testID?: string;
}

/**
 * A pantry list row: a line-icon ingredient badge (never emoji), name, a
 * quantity/expiry subtitle, and a trailing stock-state pill. Expiring items add
 * a soft warning/danger expiry badge.
 */
export function PantryItemRow({ item, onPress, testID }: PantryItemRowProps) {
  const { t } = useTranslation();
  const expiry = expiryInfo(item.expiryDate);

  const quantityText =
    item.trackingMode === "state_only" || item.unit === null
      ? null
      : `${trimQuantity(item.quantity)}${item.unit ? ` ${item.unit}` : ""}`;

  const expiryLabel = expiry
    ? expiry.level === "expired"
      ? t("pantry.expiry.expired")
      : expiry.days === 0
        ? t("pantry.expiry.today")
        : t("pantry.expiry.inDays", { count: expiry.days })
    : null;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
      testID={testID}
    >
      <View style={styles.iconCircle}>
        <Icon name="leaf" size={20} color="secondary" />
      </View>
      <View style={styles.textBlock}>
        <Text variant="title" color="text" numberOfLines={1}>
          {item.name}
        </Text>
        <View style={styles.subRow}>
          {quantityText ? (
            <Text variant="body-m" color="text-muted">
              {quantityText}
            </Text>
          ) : null}
          {expiryLabel ? (
            <Badge label={expiryLabel} tone={EXPIRY_TONE[expiry?.level ?? "ok"]} />
          ) : null}
        </View>
      </View>
      <StockPill state={item.stockState} testID={testID ? `${testID}-stock` : undefined} />
    </Pressable>
  );
}

const trimQuantity = (value: number): string =>
  Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[12],
    paddingVertical: theme.spacing[12],
  },
  pressed: { opacity: 0.7 },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors["secondary-soft"],
  },
  textBlock: { flex: 1, gap: theme.spacing[4] },
  subRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[8],
    flexWrap: "wrap",
  },
});
