import { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import type { ExpenseCategory } from "@kitchenpal/api-contract";
import { Screen, Text, Card, Button, Input, Icon } from "../src/ui";
import { theme } from "../src/theme";
import { formatVnd } from "../src/lib/currency";
import { Segmented } from "../src/features/pantry/Segmented";
import { shoppingApi } from "../src/api/shopping";
import { useQuery } from "@tanstack/react-query";
import { shoppingKeys } from "../src/features/shopping/hooks";
import { buildExpenseDraftFromList } from "../src/features/shopping/expense-draft";
import {
  buildExpensePayload,
  computeItemsTotal,
  emptyDraftItem,
  type ExpenseFormState,
} from "../src/features/spending/expense-form-model";
import { EXPENSE_CATEGORIES, categoryLabel } from "../src/features/spending/labels";
import { useCreateExpense } from "../src/features/spending/hooks";
import { resolveErrorMessage } from "../src/lib/error-message";

/**
 * Log Expense — an itemized form (name / quantity / price per line) whose line
 * prices auto-total in integer đồng, plus category, note, and date. When reached
 * via a shopping checkout (`?listId=`), it prefills the bought items and links the
 * expense to that list so the spend is attributed to it.
 */
export default function ExpenseLogScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { listId } = useLocalSearchParams<{ listId?: string }>();

  // Prefill from a shopping list when arriving from checkout. The current list is
  // usually already cached; fall back to fetching it by id.
  const listQuery = useQuery({
    queryKey: listId ? [...shoppingKeys.all, "for-expense", listId] : ["noop"],
    queryFn: () => shoppingApi.getById(listId as string),
    enabled: !!listId,
  });

  const draft = useMemo(
    () => (listQuery.data ? buildExpenseDraftFromList(listQuery.data) : null),
    [listQuery.data],
  );

  const [form, setForm] = useState<ExpenseFormState>({
    items: [emptyDraftItem()],
    category: "groceries",
    note: "",
    shoppingListId: undefined,
  });
  // Adopt the prefilled draft once it loads (only while the form is still pristine
  // — a single blank line — so we never clobber the shopper's edits).
  const [adopted, setAdopted] = useState(false);
  if (draft && !adopted) {
    setAdopted(true);
    setForm((prev) => ({
      ...prev,
      shoppingListId: draft.shoppingListId,
      items: draft.items.length > 0 ? draft.items : prev.items,
    }));
  }

  const create = useCreateExpense();
  const total = computeItemsTotal(form.items);
  const payload = buildExpensePayload(form);

  const updateItem = (index: number, patch: Partial<ExpenseFormState["items"][number]>) =>
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }));

  const addLine = () =>
    setForm((prev) => ({ ...prev, items: [...prev.items, emptyDraftItem()] }));

  const removeLine = (index: number) =>
    setForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));

  const onSubmit = () => {
    if (!payload) return;
    create.mutate(payload, { onSuccess: () => router.back() });
  };

  const categoryOptions = EXPENSE_CATEGORIES.map((category: ExpenseCategory) => ({
    value: category,
    label: categoryLabel(t, category),
  }));

  return (
    <Screen
      testID="expense-log-screen"
      footer={
        <Button
          label={t("spending.saveExpense", { total: formatVnd(total) })}
          icon="check"
          disabled={!payload}
          loading={create.isPending}
          onPress={onSubmit}
          testID="expense-log-submit"
        />
      }
    >
      <View style={styles.header}>
        <Text variant="heading-l" color="text">
          {t("spending.logExpense")}
        </Text>
        {form.shoppingListId ? (
          <Text variant="body-m" color="text-muted">
            {t("spending.linkedToList")}
          </Text>
        ) : null}
      </View>

      <Section title={t("spending.items")}>
        {form.items.map((item, index) => (
          <Card
            key={index}
            elevated={false}
            background="surface-alt"
            style={styles.itemCard}
            testID={`expense-item-${index}`}
          >
            <Input
              placeholder={t("spending.itemNamePlaceholder")}
              value={item.name}
              onChangeText={(name) => updateItem(index, { name })}
              testID={`expense-item-${index}-name`}
            />
            <View style={styles.itemMeta}>
              <View style={styles.qty}>
                <Input
                  placeholder={t("meals.qty")}
                  value={String(item.quantity)}
                  onChangeText={(value) => {
                    const qty = Number(value.replace(",", "."));
                    updateItem(index, {
                      quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
                    });
                  }}
                  keyboardType="numeric"
                  testID={`expense-item-${index}-qty`}
                />
              </View>
              <View style={styles.price}>
                <Input
                  placeholder={t("spending.pricePlaceholder")}
                  value={item.total}
                  onChangeText={(value) => updateItem(index, { total: value })}
                  keyboardType="numeric"
                  testID={`expense-item-${index}-total`}
                />
              </View>
              {form.items.length > 1 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("common.delete")}
                  onPress={() => removeLine(index)}
                  hitSlop={8}
                  style={styles.removeLine}
                  testID={`expense-item-${index}-remove`}
                >
                  <Icon name="close" size={18} color="text-subtle" />
                </Pressable>
              ) : null}
            </View>
          </Card>
        ))}
        <Button
          label={t("spending.addLine")}
          variant="ghost"
          icon="plus"
          onPress={addLine}
          testID="expense-add-line"
        />
      </Section>

      <Section title={t("spending.categoryLabel")}>
        <Segmented
          options={categoryOptions}
          value={form.category}
          onChange={(category) => setForm((prev) => ({ ...prev, category }))}
          testID="expense-category"
        />
      </Section>

      <Section title={t("spending.noteLabel")}>
        <Input
          placeholder={t("spending.notePlaceholder")}
          value={form.note}
          onChangeText={(note) => setForm((prev) => ({ ...prev, note }))}
          multiline
          testID="expense-note"
        />
      </Section>

      {create.error ? (
        <Text variant="body-m" color="danger" testID="expense-error">
          {resolveErrorMessage(create.error, t)}
        </Text>
      ) : null}

      <Button
        label={t("common.back")}
        variant="ghost"
        onPress={() => router.back()}
      />
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="heading-s" color="text">
        {title}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: theme.spacing[8], gap: theme.spacing[4] },
  section: { marginTop: theme.spacing[24], gap: theme.spacing[12] },
  itemCard: { gap: theme.spacing[12] },
  itemMeta: { flexDirection: "row", alignItems: "center", gap: theme.spacing[12] },
  qty: { width: 88 },
  price: { flex: 1 },
  removeLine: { padding: theme.spacing[8] },
});
