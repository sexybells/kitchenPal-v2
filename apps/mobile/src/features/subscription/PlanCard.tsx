import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { SubscriptionPlanResponse } from "@kitchenpal/api-contract";
import { Card, Text, Badge, Icon } from "../../ui";
import { theme } from "../../theme";
import { formatVnd } from "../../lib/currency";

export interface PlanCardProps {
  plan: SubscriptionPlanResponse;
  /** The caller currently holds this plan's tier. */
  isCurrent: boolean;
  /** Visually emphasise this plan as the suggested upgrade. */
  isRecommended: boolean;
  testID?: string;
}

/**
 * One subscription tier: name, price (VND, or "free" for a 0 price), and its
 * feature list. A recommended plan gets a highlighted border + tag; the caller's
 * current plan is flagged so the Paywall never re-offers what they already have.
 */
export function PlanCard({ plan, isCurrent, isRecommended, testID }: PlanCardProps) {
  const { t } = useTranslation();
  const isFree = plan.priceVnd === 0;

  return (
    <Card
      style={[styles.card, isRecommended ? styles.recommended : null]}
      testID={testID}
    >
      <View style={styles.head}>
        <Text variant="heading-s" color="text">
          {plan.name}
        </Text>
        <View style={styles.tags}>
          {isRecommended ? (
            <Badge
              label={t("paywall.recommended")}
              tone="primary"
              testID={`${testID}-recommended`}
            />
          ) : null}
          {isCurrent ? (
            <Badge label={t("paywall.currentTag")} tone="success" testID={`${testID}-current`} />
          ) : null}
        </View>
      </View>

      <Text variant="display-m" color="text" testID={`${testID}-price`}>
        {isFree ? t("paywall.free") : formatVnd(plan.priceVnd)}
      </Text>

      {plan.features.length > 0 ? (
        <View style={styles.features}>
          <Text variant="label-m" color="text-muted">
            {t("paywall.featuresTitle")}
          </Text>
          {plan.features.map((feature) => (
            <View key={feature} style={styles.featureRow}>
              <Icon name="check" size={18} color="primary" />
              <Text variant="body-m" color="text" style={styles.featureText}>
                {feature}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: theme.spacing[12] },
  recommended: {
    borderWidth: 2,
    borderColor: theme.colors.primary,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[8],
  },
  tags: { flexDirection: "row", gap: theme.spacing[8] },
  features: { gap: theme.spacing[8] },
  featureRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing[8],
  },
  featureText: { flex: 1 },
});
