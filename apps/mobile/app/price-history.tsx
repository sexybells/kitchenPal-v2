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
import { usePriceHistory } from "../src/features/spending/hooks";
import { Sparkline } from "../src/features/spending/Sparkline";
import { resolveErrorMessage } from "../src/lib/error-message";

/**
 * Price History — per-item unit-price trend. Each row shows the item's latest
 * price, its observed min–max range, and a mini sparkline of the price over time
 * (`GET /spending/price-history`). Items are returned ordered by most-recent
 * observation.
 */
export default function PriceHistoryScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const history = usePriceHistory({ limit: 20 });

  return (
    <Screen testID="price-history-screen">
      <View style={styles.header}>
        <Text variant="heading-l" color="text">
          {t("spending.priceHistory")}
        </Text>
        <Text variant="body-m" color="text-muted">
          {t("spending.priceHistorySubtitle")}
        </Text>
      </View>

      {history.isLoading ? (
        <LoadingState label={t("common.loading")} />
      ) : history.isError ? (
        <ErrorState
          title={t("states.errorTitle")}
          body={resolveErrorMessage(history.error, t) ?? t("states.errorBody")}
          retryLabel={t("common.retry")}
          onRetry={() => history.refetch()}
          testID="price-history-error"
        />
      ) : (history.data?.items.length ?? 0) === 0 ? (
        <EmptyState
          title={t("spending.priceHistoryEmptyTitle")}
          body={t("spending.priceHistoryEmptyBody")}
          icon="clock"
          testID="price-history-empty"
        />
      ) : (
        <Card>
          {(history.data?.items ?? []).map((item) => (
            <View key={item.name} style={styles.row} testID={`price-item-${item.name}`}>
              <View style={styles.info}>
                <Text variant="title" color="text" numberOfLines={1}>
                  {item.name}
                </Text>
                <Text variant="body-m" color="text-muted">
                  {t("spending.priceRange", {
                    min: formatVnd(item.minPrice),
                    max: formatVnd(item.maxPrice),
                  })}
                </Text>
              </View>
              <View style={styles.trend}>
                <Sparkline points={item.points} />
                <Text variant="label-m" color="text">
                  {formatVnd(item.latestPrice)}
                </Text>
              </View>
            </View>
          ))}
        </Card>
      )}

      <Button label={t("common.back")} variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: theme.spacing[8], gap: theme.spacing[4], marginBottom: theme.spacing[16] },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[12],
    paddingVertical: theme.spacing[12],
  },
  info: { flex: 1, gap: theme.spacing[4] },
  trend: { alignItems: "flex-end", gap: theme.spacing[4] },
});
