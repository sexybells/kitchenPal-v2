import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Screen, Text, Card, Button, Input, Badge } from "../src/ui";
import { theme } from "../src/theme";
import { formatVnd, formatVndDigits, parseVndInput } from "../src/lib/currency";
import {
  useCurrentBudget,
  useCreateBudget,
  isNoBudgetError,
} from "../src/features/spending/hooks";
import { ApiClientError } from "../src/api/errors";
import { resolveErrorMessage } from "../src/lib/error-message";

/**
 * Localize a budget create failure. An overlapping-cycle rejection comes back as
 * a 409 (the server guards against two live budgets covering the same days) and
 * gets a specific message; anything else falls back to the shared resolver.
 */
const budgetErrorMessage = (error: unknown, t: TFunction): string | null => {
  if (error instanceof ApiClientError && error.status === 409) {
    return t("spending.budgetOverlapError");
  }
  return resolveErrorMessage(error, t);
};

/** Short ISO date (YYYY-MM-DD) for the cycle range labels. */
const shortDate = (iso: string): string => iso.slice(0, 10);

/**
 * Budget — shows the active 30-day cycle (amount, spent, remaining, dates) when
 * one exists, and a form to set the budget for a new cycle. Overlapping cycles are
 * rejected by the server with a 409 that surfaces here as a localized error.
 */
export default function BudgetScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  const budget = useCurrentBudget();
  const create = useCreateBudget();
  const [amount, setAmount] = useState("");

  const parsed = parseVndInput(amount);
  const budgetData = budget.data;

  const onSubmit = () => {
    if (parsed <= 0) return;
    create.mutate(
      { amount: parsed },
      { onSuccess: () => setAmount("") },
    );
  };

  return (
    <Screen testID="budget-screen">
      <View style={styles.header}>
        <Text variant="heading-l" color="text">
          {t("spending.budget")}
        </Text>
      </View>

      {budgetData ? (
        <Card testID="budget-current">
          <View style={styles.currentHead}>
            <Text variant="label-m" color="text-muted">
              {t("spending.currentCycle")}
            </Text>
            <Badge
              label={budgetData.remaining < 0 ? t("spending.overBudget") : t("spending.onTrack")}
              tone={budgetData.remaining < 0 ? "danger" : "success"}
            />
          </View>
          <Text variant="display-m" color="text">
            {formatVnd(budgetData.amount)}
          </Text>
          <View style={styles.statsRow}>
            <Stat label={t("spending.spent")} value={formatVnd(budgetData.spent)} />
            <Stat
              label={t("spending.remaining")}
              value={formatVnd(budgetData.remaining)}
              tone={budgetData.remaining < 0 ? "danger" : "text"}
            />
          </View>
          <Text variant="body-m" color="text-muted" style={styles.cycleRange}>
            {t("spending.cycleRange", {
              start: shortDate(budgetData.cycleStart),
              end: shortDate(budgetData.cycleEnd),
            })}
          </Text>
        </Card>
      ) : budget.isError && !isNoBudgetError(budget.error) ? (
        <Text variant="body-m" color="danger">
          {resolveErrorMessage(budget.error, t)}
        </Text>
      ) : null}

      <Card style={styles.formCard} elevated={false} background="surface-alt">
        <Text variant="heading-s" color="text">
          {budgetData ? t("spending.setNextBudget") : t("spending.setBudget")}
        </Text>
        <Input
          label={t("spending.amountLabel")}
          placeholder={t("spending.amountPlaceholder")}
          value={amount ? formatVndDigits(parsed) : ""}
          onChangeText={setAmount}
          keyboardType="numeric"
          testID="budget-amount"
        />
        <Button
          label={t("spending.saveBudget")}
          icon="check"
          disabled={parsed <= 0}
          loading={create.isPending}
          onPress={onSubmit}
          testID="budget-save"
        />
        {create.error ? (
          <Text variant="body-m" color="danger" testID="budget-error">
            {budgetErrorMessage(create.error, t)}
          </Text>
        ) : null}
        {create.isSuccess ? (
          <Text variant="body-m" color="success" testID="budget-success">
            {t("spending.budgetSaved")}
          </Text>
        ) : null}
      </Card>

      <Button label={t("common.back")} variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}

function Stat({
  label,
  value,
  tone = "text",
}: {
  label: string;
  value: string;
  tone?: "text" | "danger";
}) {
  return (
    <View style={styles.stat}>
      <Text variant="caption" color="text-muted">
        {label}
      </Text>
      <Text variant="title" color={tone}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: theme.spacing[8], marginBottom: theme.spacing[16] },
  currentHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: theme.spacing[8],
  },
  statsRow: { flexDirection: "row", gap: theme.spacing[24], marginTop: theme.spacing[16] },
  stat: { gap: theme.spacing[4] },
  cycleRange: { marginTop: theme.spacing[12] },
  formCard: { gap: theme.spacing[16], marginTop: theme.spacing[24] },
});
