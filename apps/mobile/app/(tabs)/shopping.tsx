import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  Screen,
  Text,
  Card,
  Button,
  Input,
  Badge,
  LoadingState,
  ErrorState,
  EmptyState,
} from "../../src/ui";
import { theme } from "../../src/theme";
import {
  useCurrentShoppingList,
  useAddShoppingItem,
  useToggleBought,
  useDeleteShoppingItem,
  useGenerateList,
  isNoListError,
} from "../../src/features/shopping/hooks";
import { groupByCategory, summarize } from "../../src/features/shopping/grouping";
import { shoppingCategoryLabel } from "../../src/features/shopping/labels";
import { ShoppingItemRow } from "../../src/features/shopping/ShoppingItemRow";
import { useCurrentMealPlan } from "../../src/features/recipes/hooks";
import { resolveErrorMessage } from "../../src/lib/error-message";

/**
 * Shopping tab — the grouped checklist. Items are grouped by category, toggled
 * bought optimistically (version-guarded on the server), tagged "từ công thức"
 * when recipe-sourced, and totalled in a checkout bar that hands off to Log
 * Expense. When there is no list yet, the empty state offers to generate one from
 * this week's meal plan.
 */
export default function ShoppingScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  const list = useCurrentShoppingList();
  const plan = useCurrentMealPlan();
  const generate = useGenerateList();

  const listId = list.data?.id ?? "";
  const version = list.data?.version ?? 0;
  const addItem = useAddShoppingItem(listId);
  const toggle = useToggleBought(listId);
  const remove = useDeleteShoppingItem(listId);

  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");

  const items = useMemo(() => list.data?.items ?? [], [list.data]);
  const groups = useMemo(() => groupByCategory(items), [items]);
  const summary = useMemo(() => summarize(items), [items]);

  const onAdd = () => {
    const trimmed = name.trim();
    if (trimmed.length === 0 || !list.data) return;
    const qty = Number(quantity.replace(",", "."));
    addItem.mutate(
      {
        name: trimmed,
        quantity: Number.isFinite(qty) && qty > 0 ? qty : null,
        unit: unit.trim() || null,
        expectedVersion: version,
      },
      {
        onSuccess: () => {
          setName("");
          setQuantity("");
          setUnit("");
        },
      },
    );
  };

  if (list.isLoading) {
    return (
      <Screen>
        <LoadingState label={t("common.loading")} />
      </Screen>
    );
  }

  // A non-404 failure is a real error; a 404 just means "no list yet".
  if (list.isError && !isNoListError(list.error)) {
    return (
      <Screen>
        <ErrorState
          title={t("states.errorTitle")}
          body={resolveErrorMessage(list.error, t) ?? t("states.errorBody")}
          retryLabel={t("common.retry")}
          onRetry={() => list.refetch()}
          testID="shopping-error"
        />
      </Screen>
    );
  }

  const hasList = !!list.data;
  const planId = plan.data?.id;

  return (
    <Screen
      testID="shopping-screen"
      footer={
        hasList && summary.total > 0 ? (
          <View style={styles.checkout} testID="shopping-checkout">
            <View style={styles.checkoutInfo}>
              <Text variant="label-m" color="text">
                {t("shopping.progress", {
                  bought: summary.bought,
                  total: summary.total,
                })}
              </Text>
              <Text variant="body-m" color="text-muted">
                {t("shopping.remainingCount", { count: summary.remaining })}
              </Text>
            </View>
            <Button
              label={t("shopping.logExpense")}
              icon="spending"
              fullWidth={false}
              onPress={() =>
                router.push(`/expense-log?listId=${list.data?.id ?? ""}`)
              }
              testID="shopping-checkout-log"
            />
          </View>
        ) : null
      }
    >
      <View style={styles.header}>
        <Text variant="heading-l" color="text">
          {t("tabs.shopping")}
        </Text>
        {hasList && summary.total > 0 ? (
          <Badge
            label={t("shopping.itemCount", { count: summary.total })}
            tone="neutral"
          />
        ) : null}
      </View>

      {hasList ? (
        <>
          <Card style={styles.addCard} elevated={false} background="surface-alt">
            <Input
              placeholder={t("shopping.addPlaceholder")}
              value={name}
              onChangeText={setName}
              testID="shopping-add-name"
            />
            <View style={styles.addMetaRow}>
              <View style={styles.addQty}>
                <Input
                  placeholder={t("meals.qty")}
                  value={quantity}
                  onChangeText={setQuantity}
                  keyboardType="numeric"
                  testID="shopping-add-qty"
                />
              </View>
              <View style={styles.addUnit}>
                <Input
                  placeholder={t("pantry.unitPlaceholder")}
                  value={unit}
                  onChangeText={setUnit}
                  testID="shopping-add-unit"
                />
              </View>
            </View>
            <Button
              label={t("shopping.addItem")}
              variant="secondary"
              icon="plus"
              disabled={name.trim().length === 0}
              loading={addItem.isPending}
              onPress={onAdd}
              testID="shopping-add-submit"
            />
            {addItem.error ? (
              <Text variant="body-m" color="danger" testID="shopping-add-error">
                {resolveErrorMessage(addItem.error, t)}
              </Text>
            ) : null}
          </Card>

          {toggle.error || remove.error ? (
            <Text
              variant="body-m"
              color="danger"
              testID="shopping-mutation-error"
            >
              {resolveErrorMessage(toggle.error ?? remove.error, t)}
            </Text>
          ) : null}

          {summary.total === 0 ? (
            <EmptyState
              title={t("shopping.emptyTitle")}
              body={t("shopping.emptyBody")}
              icon="shopping"
              testID="shopping-empty-list"
            />
          ) : (
            groups.map((group) => (
              <View key={group.category} style={styles.group}>
                <Text variant="label-m" color="text-muted">
                  {shoppingCategoryLabel(t, group.category)}
                </Text>
                <Card>
                  {group.items.map((item) => (
                    <ShoppingItemRow
                      key={item.id}
                      item={item}
                      disabled={
                        toggle.isPending || remove.isPending || addItem.isPending
                      }
                      onToggle={() =>
                        toggle.mutate({
                          itemId: item.id,
                          bought: !item.bought,
                          expectedVersion: version,
                        })
                      }
                      onRemove={() =>
                        remove.mutate({ itemId: item.id, expectedVersion: version })
                      }
                      testID={`shopping-item-${item.id}`}
                    />
                  ))}
                </Card>
              </View>
            ))
          )}
        </>
      ) : (
        <View style={styles.body}>
          <EmptyState
            title={t("shopping.noListTitle")}
            body={t("shopping.noListBody")}
            icon="shopping"
            testID="shopping-no-list"
          />
          {planId ? (
            <Button
              label={t("shopping.generateFromPlan")}
              icon="meals"
              loading={generate.isPending}
              onPress={() => generate.mutate({ mealPlanId: planId })}
              testID="shopping-generate"
            />
          ) : null}
          {generate.error ? (
            <Text variant="body-m" color="danger" center>
              {resolveErrorMessage(generate.error, t)}
            </Text>
          ) : null}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: theme.spacing[8],
    marginBottom: theme.spacing[16],
  },
  body: { flex: 1, minHeight: 320, gap: theme.spacing[16], justifyContent: "center" },
  addCard: { gap: theme.spacing[12], marginBottom: theme.spacing[20] },
  addMetaRow: { flexDirection: "row", gap: theme.spacing[12] },
  addQty: { width: 96 },
  addUnit: { flex: 1 },
  group: { gap: theme.spacing[8], marginBottom: theme.spacing[20] },
  checkout: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[12],
  },
  checkoutInfo: { flex: 1, gap: theme.spacing[4] },
});
