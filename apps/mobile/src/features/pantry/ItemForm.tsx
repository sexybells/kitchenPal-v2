import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import type {
  CreatePantryItemInput,
  PantryItemResponse,
  StockState,
  TrackingMode,
} from "@kitchenpal/api-contract";
import { theme } from "../../theme";
import { Text, Input, Button } from "../../ui";
import { Segmented } from "./Segmented";
import { QuantityStepper } from "./QuantityStepper";
import {
  PANTRY_CATEGORIES,
  STOCK_STATES,
  TRACKING_MODES,
  categoryLabel,
  expiryInfo,
  isPresetCategory,
} from "./stock";

/** Local, string-friendly form state (days text, not a Date). */
export interface ItemFormValues {
  name: string;
  category: string;
  trackingMode: TrackingMode;
  stockState: StockState;
  quantity: number;
  unit: string;
  expiryDays: string;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Derive initial form values from an existing item (or sensible defaults). */
export const initialFormValues = (item?: PantryItemResponse): ItemFormValues => {
  const expiry = item ? expiryInfo(item.expiryDate) : null;
  return {
    name: item?.name ?? "",
    category: item?.category ?? "produce",
    trackingMode: item?.trackingMode ?? "state_only",
    stockState: item?.stockState ?? "plenty",
    quantity: item?.quantity ?? 1,
    unit: item?.unit ?? "",
    expiryDays: expiry && expiry.days >= 0 ? String(expiry.days) : "",
  };
};

/**
 * Convert form values to the create payload. Quantity/unit are only sent for
 * quantity-tracked items; `expiryDays` becomes an absolute date (null clears).
 */
export const buildItemPayload = (values: ItemFormValues): CreatePantryItemInput => {
  const quantityTracked = values.trackingMode !== "state_only";
  const trimmedDays = values.expiryDays.trim();
  const parsedDays = trimmedDays === "" ? null : Number(trimmedDays);
  const expiryDate =
    parsedDays === null || Number.isNaN(parsedDays)
      ? null
      : new Date(Date.now() + parsedDays * MS_PER_DAY);
  const unit = values.unit.trim();

  return {
    name: values.name.trim(),
    category: values.category,
    stockState: values.stockState,
    trackingMode: values.trackingMode,
    quantity: quantityTracked ? values.quantity : undefined,
    unit: quantityTracked && unit.length > 0 ? unit : null,
    expiryDate,
  };
};

export interface ItemFormProps {
  initial: ItemFormValues;
  submitting?: boolean;
  submitLabel: string;
  onSubmit: (values: ItemFormValues) => void;
  testID?: string;
}

/**
 * Shared add/edit form. Stock level is the assistive default (`state_only`);
 * quantity + unit appear only when the item is tracked by unit or exactly.
 */
export function ItemForm({
  initial,
  submitting = false,
  submitLabel,
  onSubmit,
  testID,
}: ItemFormProps) {
  const { t } = useTranslation();
  const [values, setValues] = useState<ItemFormValues>(initial);

  const categoryOptions = useMemo(() => {
    // Include the item's own category even if it isn't a preset (edit case).
    const base: readonly string[] = isPresetCategory(values.category)
      ? PANTRY_CATEGORIES
      : [values.category, ...PANTRY_CATEGORIES];
    return base.map((value) => ({ value, label: categoryLabel(t, value) }));
  }, [t, values.category]);

  const stockOptions = STOCK_STATES.map((value) => ({
    value,
    label: t(`pantry.stock.${value}`),
  }));
  const trackingOptions = TRACKING_MODES.map((value) => ({
    value,
    label: t(`pantry.tracking.${value}`),
  }));

  const quantityTracked = values.trackingMode !== "state_only";
  const canSubmit = values.name.trim().length > 0 && !submitting;

  return (
    <View style={styles.form} testID={testID}>
      <Input
        label={t("pantry.nameLabel")}
        placeholder={t("pantry.namePlaceholder")}
        value={values.name}
        onChangeText={(name) => setValues((prev) => ({ ...prev, name }))}
        testID="item-name"
      />

      <Field label={t("pantry.categoryLabel")}>
        <Segmented
          options={categoryOptions}
          value={values.category}
          onChange={(category) => setValues((prev) => ({ ...prev, category }))}
          testID="item-category"
        />
      </Field>

      <Field label={t("pantry.trackingLabel")}>
        <Segmented
          options={trackingOptions}
          value={values.trackingMode}
          onChange={(trackingMode) =>
            setValues((prev) => ({ ...prev, trackingMode }))
          }
          testID="item-tracking"
        />
      </Field>

      <Field label={t("pantry.stockLabel")}>
        <Segmented
          options={stockOptions}
          value={values.stockState}
          onChange={(stockState) => setValues((prev) => ({ ...prev, stockState }))}
          testID="item-stock"
        />
      </Field>

      {quantityTracked ? (
        <Field label={t("pantry.quantityLabel")}>
          <View style={styles.quantityRow}>
            <QuantityStepper
              value={values.quantity}
              onChange={(quantity) => setValues((prev) => ({ ...prev, quantity }))}
              testID="item-quantity"
            />
            <View style={styles.unitInput}>
              <Input
                placeholder={t("pantry.unitPlaceholder")}
                value={values.unit}
                onChangeText={(unit) => setValues((prev) => ({ ...prev, unit }))}
                autoCapitalize="none"
                testID="item-unit"
              />
            </View>
          </View>
        </Field>
      ) : null}

      <Input
        label={t("pantry.expiryLabel")}
        placeholder={t("pantry.expiryHint")}
        value={values.expiryDays}
        onChangeText={(expiryDays) =>
          setValues((prev) => ({
            ...prev,
            expiryDays: expiryDays.replace(/[^0-9]/g, ""),
          }))
        }
        keyboardType="number-pad"
        testID="item-expiry"
      />

      <Button
        label={submitLabel}
        loading={submitting}
        disabled={!canSubmit}
        onPress={() => onSubmit(values)}
        testID="item-submit"
      />
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text variant="label-m" color="text">
        {label}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: theme.spacing[20] },
  field: { gap: theme.spacing[8] },
  quantityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[16],
  },
  unitInput: { flex: 1 },
});
