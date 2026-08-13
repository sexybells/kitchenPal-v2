import { StyleSheet, View, Pressable } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  Screen,
  ScreenHeader,
  Text,
  Card,
  Button,
  Badge,
  Icon,
  LoadingState,
  ErrorState,
} from "../src/ui";
import type { IconName } from "../src/ui";
import { theme } from "../src/theme";
import { formatVnd } from "../src/lib/currency";
import {
  useCurrentBudget,
  useSpendingSummary,
  useExpenses,
  useDeleteExpense,
  isNoBudgetError,
} from "../src/features/spending/hooks";
import { CategoryBars } from "../src/features/spending/CategoryBars";
import { categoryLabel, categoryIcon } from "../src/features/spending/labels";
import { resolveErrorMessage } from "../src/lib/error-message";

interface QuickAction {
  icon: IconName;
  href: Href;
  label: string;
}

/**
 * Spending overview — the budget/balance card (budget vs spent, remaining), the
 * category breakdown for the current cycle, and recent expenses, plus quick links
 * into Log Expense, Budget, Analytics, and Price History.
 */
export default function SpendingScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  const budget = useCurrentBudget();
  const summary = useSpendingSummary();
  const recent = useExpenses({ limit: 5 });
  const deleteExpense = useDeleteExpense();

  const actions: QuickAction[] = [
    { icon: "spending", href: "/expense-log", label: t("spending.logExpense") },
    { icon: "star", href: "/budget", label: t("spending.budget") },
    { icon: "sparkles", href: "/spending-analytics", label: t("spending.analytics") },
    { icon: "clock", href: "/price-history", label: t("spending.priceHistory") },
  ];

  const budgetData = budget.data;
  const spent = summary.data?.totalSpent ?? budgetData?.spent ?? 0;
  const progress =
    budgetData && budgetData.amount > 0
      ? Math.min(1, spent / budgetData.amount)
      : 0;
  const overspent = budgetData ? budgetData.remaining < 0 : false;

  if (budget.isLoading && summary.isLoading) {
    return (
      <Screen>
        <ScreenHeader title={t("menu.spending")} onBack={() => router.back()} />
        <LoadingState label={t("common.loading")} />
      </Screen>
    );
  }

  // A non-404 budget failure is a real error; a 404 is just "no budget yet".
  if (budget.isError && !isNoBudgetError(budget.error)) {
    return (
      <Screen>
        <ScreenHeader title={t("menu.spending")} onBack={() => router.back()} />
        <ErrorState
          title={t("states.errorTitle")}
          body={resolveErrorMessage(budget.error, t) ?? t("states.errorBody")}
          retryLabel={t("common.retry")}
          onRetry={() => budget.refetch()}
          testID="spending-error"
        />
      </Screen>
    );
  }

  return (
    <Screen testID="spending-screen">
      <ScreenHeader title={t("menu.spending")} onBack={() => router.back()} />

      <Card testID="spending-budget-card">
        {budgetData ? (
          <>
            <View style={styles.budgetHead}>
              <Text variant="label-m" color="text-muted">
                {t("spending.remainingThisCycle")}
              </Text>
              <Badge
                label={overspent ? t("spending.overBudget") : t("spending.onTrack")}
                tone={overspent ? "danger" : "success"}
              />
            </View>
            <Text
              variant="display-m"
              color={overspent ? "danger" : "text"}
              testID="spending-remaining"
            >
              {formatVnd(budgetData.remaining)}
            </Text>
            <View style={styles.track}>
              <View
                style={[
                  styles.fill,
                  {
                    width: `${Math.round(progress * 100)}%`,
                    backgroundColor: overspent
                      ? theme.colors.danger
                      : theme.colors.primary,
                  },
                ]}
              />
            </View>
            <View style={styles.budgetFoot}>
              <Text variant="body-m" color="text-muted">
                {t("spending.spentOf", {
                  spent: formatVnd(spent),
                  total: formatVnd(budgetData.amount),
                })}
              </Text>
            </View>
          </>
        ) : (
          <View style={styles.noBudget}>
            <Text variant="heading-s" color="text">
              {t("spending.noBudgetTitle")}
            </Text>
            <Text variant="body-m" color="text-muted">
              {t("spending.noBudgetBody")}
            </Text>
            <Button
              label={t("spending.setBudget")}
              icon="star"
              onPress={() => router.push("/budget")}
              testID="spending-set-budget"
            />
          </View>
        )}
      </Card>

      <View style={styles.actionRow}>
        {actions.map((action) => (
          <Pressable
            key={action.icon}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            onPress={() => router.push(action.href)}
            style={styles.action}
            testID={`spending-action-${action.icon}`}
          >
            <View style={styles.actionIcon}>
              <Icon name={action.icon} size={20} color="primary" />
            </View>
            <Text variant="label-s" color="text-muted" center numberOfLines={2}>
              {action.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Section title={t("spending.byCategory")}>
        <Card elevated={false} background="surface-alt">
          <CategoryBars
            byCategory={summary.data?.byCategory ?? []}
            testID="spending-breakdown"
          />
        </Card>
      </Section>

      <Section title={t("spending.recent")}>
        {(recent.data?.length ?? 0) === 0 ? (
          <Card elevated={false} background="surface-alt">
            <Text variant="body-m" color="text-muted">
              {t("spending.noExpenses")}
            </Text>
          </Card>
        ) : (
          <Card>
            {(recent.data ?? []).map((expense) => (
              <View
                key={expense.id}
                style={styles.expenseRow}
                testID={`spending-expense-${expense.id}`}
              >
                <View style={styles.expenseIcon}>
                  <Icon name={categoryIcon(expense.category)} size={18} color="secondary" />
                </View>
                <View style={styles.expenseBody}>
                  <Text variant="title" color="text" numberOfLines={1}>
                    {expense.note ?? categoryLabel(t, expense.category)}
                  </Text>
                  <Text variant="body-m" color="text-muted">
                    {formatDate(expense.date)}
                  </Text>
                </View>
                <Text variant="label-m" color="text">
                  {formatVnd(expense.totalAmount)}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("common.delete")}
                  disabled={deleteExpense.isPending}
                  hitSlop={8}
                  onPress={() => deleteExpense.mutate(expense.id)}
                  testID={`spending-expense-${expense.id}-delete`}
                >
                  <Icon name="close" size={18} color="text-subtle" />
                </Pressable>
              </View>
            ))}
          </Card>
        )}
      </Section>

      <Button
        label={t("spending.logExpense")}
        icon="plus"
        onPress={() => router.push("/expense-log")}
        testID="spending-log-cta"
      />
    </Screen>
  );
}

/** Short local date for an expense row (YYYY-MM-DD, locale-agnostic). */
const formatDate = (iso: string): string => iso.slice(0, 10);

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
  budgetHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: theme.spacing[8],
  },
  track: {
    height: 10,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors["surface-sunken"],
    overflow: "hidden",
    marginTop: theme.spacing[16],
  },
  fill: { height: "100%", borderRadius: theme.radius.full },
  budgetFoot: { marginTop: theme.spacing[8] },
  noBudget: { gap: theme.spacing[12], alignItems: "flex-start" },
  actionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: theme.spacing[24],
  },
  action: { flex: 1, alignItems: "center", gap: theme.spacing[8] },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors["primary-soft"],
    alignItems: "center",
    justifyContent: "center",
  },
  section: { marginTop: theme.spacing[28], gap: theme.spacing[12] },
  expenseRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[12],
    paddingVertical: theme.spacing[12],
  },
  expenseIcon: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors["secondary-soft"],
    alignItems: "center",
    justifyContent: "center",
  },
  expenseBody: { flex: 1, gap: theme.spacing[4] },
});
