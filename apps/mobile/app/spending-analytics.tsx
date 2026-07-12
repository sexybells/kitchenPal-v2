import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  Screen,
  Text,
  Card,
  Button,
  LoadingState,
  ErrorState,
  EmptyState,
} from "../src/ui";
import { theme } from "../src/theme";
import { formatVnd } from "../src/lib/currency";
import { Segmented } from "../src/features/pantry/Segmented";
import { useSpendingStats } from "../src/features/spending/hooks";
import { TrendChart } from "../src/features/spending/TrendChart";
import { CategoryBars } from "../src/features/spending/CategoryBars";
import { resolveErrorMessage } from "../src/lib/error-message";

type Interval = "day" | "month";

/**
 * Spending analytics — a trend line over the cycle and the category breakdown,
 * driven by `GET /spending/stats`. The day/month toggle re-buckets the series.
 * Chart geometry is computed by the pure `analytics` transforms; this screen just
 * feeds them data and renders the SVG.
 */
export default function SpendingAnalyticsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [interval, setInterval] = useState<Interval>("day");

  const stats = useSpendingStats({ interval });

  const totalSpent =
    stats.data?.series.reduce((sum, point) => sum + point.total, 0) ?? 0;
  const hasData = (stats.data?.series.length ?? 0) > 0;

  return (
    <Screen testID="analytics-screen">
      <View style={styles.header}>
        <Text variant="heading-l" color="text">
          {t("spending.analytics")}
        </Text>
      </View>

      <Segmented
        options={[
          { value: "day" as Interval, label: t("spending.intervalDay") },
          { value: "month" as Interval, label: t("spending.intervalMonth") },
        ]}
        value={interval}
        onChange={setInterval}
        testID="analytics-interval"
      />

      {stats.isLoading ? (
        <LoadingState label={t("common.loading")} />
      ) : stats.isError ? (
        <ErrorState
          title={t("states.errorTitle")}
          body={resolveErrorMessage(stats.error, t) ?? t("states.errorBody")}
          retryLabel={t("common.retry")}
          onRetry={() => stats.refetch()}
          testID="analytics-error"
        />
      ) : (
        <>
          <Card style={styles.trendCard} testID="analytics-trend">
            <View style={styles.trendHead}>
              <Text variant="label-m" color="text-muted">
                {t("spending.trend")}
              </Text>
              <Text variant="heading-m" color="text">
                {formatVnd(totalSpent)}
              </Text>
            </View>
            {hasData ? (
              <TrendChart series={stats.data?.series ?? []} />
            ) : (
              <EmptyState title={t("spending.noData")} icon="sparkles" />
            )}
          </Card>

          <View style={styles.section}>
            <Text variant="heading-s" color="text">
              {t("spending.byCategory")}
            </Text>
            <Card elevated={false} background="surface-alt">
              <CategoryBars
                byCategory={stats.data?.byCategory ?? []}
                testID="analytics-breakdown"
              />
            </Card>
          </View>
        </>
      )}

      <Button label={t("common.back")} variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: theme.spacing[8], marginBottom: theme.spacing[16] },
  trendCard: { marginTop: theme.spacing[20], gap: theme.spacing[16] },
  trendHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  section: { marginTop: theme.spacing[28], gap: theme.spacing[12] },
});
