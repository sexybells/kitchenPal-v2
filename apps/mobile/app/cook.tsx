import { useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import type {
  CookMealInput,
  CookResult,
  PantryItemResponse,
} from "@kitchenpal/api-contract";
import {
  Screen,
  Text,
  Button,
  Icon,
  Badge,
  LoadingState,
  EmptyState,
} from "../src/ui";
import { theme } from "../src/theme";
import { usePantryItems, useCook } from "../src/features/pantry/hooks";
import { StockPill } from "../src/features/pantry/StockPill";
import { QuantityStepper } from "../src/features/pantry/QuantityStepper";
import { generateIdempotencyKey } from "../src/features/pantry/stock";
import { resolveErrorMessage } from "../src/lib/error-message";

interface Selection {
  quantity: number;
}

/**
 * Cook from what you have: pick pantry items you used, deplete them via the
 * cook loop (with an idempotency key so a retry can't double-deplete), then see
 * what dropped low and is worth restocking.
 */
export default function CookScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const items = usePantryItems();
  const cook = useCook();

  const [selected, setSelected] = useState<Record<string, Selection>>({});
  // One idempotency key per screen session — a retry reuses it.
  const idempotencyKey = useRef(generateIdempotencyKey());

  const available = useMemo(
    () => (items.data ?? []).filter((item) => item.stockState !== "out"),
    [items.data],
  );

  const toggle = (item: PantryItemResponse) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[item.id]) {
        delete next[item.id];
      } else {
        next[item.id] = { quantity: item.quantity > 0 ? Math.min(item.quantity, 1) : 1 };
      }
      return next;
    });
  };

  const setQuantity = (id: string, quantity: number) =>
    setSelected((prev) => ({ ...prev, [id]: { quantity } }));

  const onCook = () => {
    const ingredients = available.reduce<CookMealInput["ingredients"]>(
      (acc, item) => {
        const pick = selected[item.id];
        if (!pick) return acc;
        const tracked = item.trackingMode !== "state_only";
        acc.push({
          pantryItemId: item.id,
          name: item.name,
          quantity: tracked ? pick.quantity : undefined,
          unit: tracked && item.unit ? item.unit : undefined,
        });
        return acc;
      },
      [],
    );
    if (ingredients.length === 0) return;
    cook.mutate({ ingredients, idempotencyKey: idempotencyKey.current });
  };

  if (items.isLoading) {
    return (
      <Screen>
        <LoadingState label={t("common.loading")} />
      </Screen>
    );
  }

  if (cook.isSuccess) {
    return <CookResultView result={cook.data} onDone={() => router.back()} />;
  }

  const selectedCount = Object.keys(selected).length;

  return (
    <Screen
      footer={
        <View style={styles.footer}>
          {cook.error ? (
            <Text variant="body-m" color="danger" center testID="cook-error">
              {resolveErrorMessage(cook.error, t)}
            </Text>
          ) : null}
          <Button
            label={t("cook.cookNow")}
            icon="meals"
            loading={cook.isPending}
            disabled={selectedCount === 0}
            onPress={onCook}
            testID="cook-submit"
          />
        </View>
      }
    >
      <View style={styles.header}>
        <Text variant="heading-l" color="text">
          {t("cook.title")}
        </Text>
        <Text variant="body-m" color="text-muted">
          {t("cook.subtitle")}
        </Text>
      </View>

      {available.length === 0 ? (
        <EmptyState title={t("cook.empty")} icon="meals" testID="cook-empty" />
      ) : (
        <View style={styles.list}>
          <Text variant="label-m" color="text-muted">
            {t("cook.selectPrompt")}
          </Text>
          {available.map((item) => {
            const pick = selected[item.id];
            const tracked = item.trackingMode !== "state_only";
            return (
              <View key={item.id} style={styles.itemBlock}>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: Boolean(pick) }}
                  onPress={() => toggle(item)}
                  style={styles.itemRow}
                  testID={`cook-item-${item.id}`}
                >
                  <View
                    style={[
                      styles.check,
                      pick ? styles.checkOn : styles.checkOff,
                    ]}
                  >
                    {pick ? <Icon name="check" size={16} color="text-inverse" /> : null}
                  </View>
                  <Text variant="title" color="text" numberOfLines={1} style={styles.itemName}>
                    {item.name}
                  </Text>
                  <StockPill state={item.stockState} />
                </Pressable>
                {pick && tracked ? (
                  <View style={styles.stepperRow}>
                    <QuantityStepper
                      value={pick.quantity}
                      min={1}
                      max={item.quantity > 0 ? item.quantity : 1_000_000}
                      onChange={(quantity) => setQuantity(item.id, quantity)}
                      unit={item.unit}
                      testID={`cook-qty-${item.id}`}
                    />
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

function CookResultView({
  result,
  onDone,
}: {
  result: CookResult;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Screen footer={<Button label={t("cook.done")} onPress={onDone} testID="cook-done" />}>
      <View style={styles.header}>
        <Text variant="heading-l" color="text">
          {t("cook.resultTitle")}
        </Text>
      </View>

      <Section title={t("cook.consumedTitle")}>
        {result.consumed.map((item) => (
          <View key={item.id} style={styles.resultRow}>
            <Text variant="body-l" color="text" style={styles.itemName} numberOfLines={1}>
              {item.name}
            </Text>
            <StockPill state={item.stockState} />
          </View>
        ))}
      </Section>

      <Section title={t("cook.refillTitle")} testID="cook-refill">
        {result.refillSuggestions.length === 0 ? (
          <Text variant="body-m" color="text-muted">
            {t("cook.refillEmpty")}
          </Text>
        ) : (
          result.refillSuggestions.map((suggestion) => (
            <View key={suggestion.pantryItemId} style={styles.resultRow}>
              <Text variant="body-l" color="text" style={styles.itemName} numberOfLines={1}>
                {suggestion.name}
              </Text>
              <StockPill state={suggestion.stockState} />
            </View>
          ))
        )}
      </Section>

      {result.unmatched.length > 0 ? (
        <Section title={t("cook.unmatchedTitle")}>
          {result.unmatched.map((entry) => (
            <Badge key={entry.name} label={entry.name} tone="neutral" />
          ))}
        </Section>
      ) : null}
    </Screen>
  );
}

function Section({
  title,
  children,
  testID,
}: {
  title: string;
  children: React.ReactNode;
  testID?: string;
}) {
  return (
    <View style={styles.section} testID={testID}>
      <Text variant="heading-s" color="text">
        {title}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: theme.spacing[4], paddingTop: theme.spacing[8] },
  list: { marginTop: theme.spacing[20], gap: theme.spacing[12] },
  itemBlock: { gap: theme.spacing[8] },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[12],
    paddingVertical: theme.spacing[4],
  },
  itemName: { flex: 1 },
  check: {
    width: 26,
    height: 26,
    borderRadius: theme.radius.full,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  checkOn: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  checkOff: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors["border-strong"],
  },
  stepperRow: { paddingLeft: theme.spacing[40] },
  section: { marginTop: theme.spacing[24], gap: theme.spacing[12] },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[12],
  },
  footer: { gap: theme.spacing[8] },
});
