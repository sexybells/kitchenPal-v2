import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Screen, Text, Button, LoadingState, ErrorState } from "../src/ui";
import { theme } from "../src/theme";
import { resolveErrorMessage } from "../src/lib/error-message";
import {
  usePlans,
  useMySubscription,
  useRequestActivation,
  useCancelSubscription,
} from "../src/features/subscription/hooks";
import { PlanCard } from "../src/features/subscription/PlanCard";
import { ContactSheet } from "../src/features/subscription/ContactSheet";

/**
 * Paywall — shows the Free vs Pro tiers with their VND prices and features,
 * highlights the recommended (Pro) plan, and reflects the caller's current
 * subscription. Monetization is admin-assigned in v1, so the upgrade CTA is
 * INERT: it opens a "contact us" sheet instead of a purchase. A Pro user can
 * self-cancel (a real downgrade to Free).
 */
export default function PaywallScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  const plans = usePlans();
  const mine = useMySubscription();
  const requestActivation = useRequestActivation();
  const cancel = useCancelSubscription();

  const [contactVisible, setContactVisible] = useState(false);

  // Cheapest first, so Free leads and Pro (the recommended upgrade) follows.
  const sortedPlans = useMemo(
    () => [...(plans.data ?? [])].sort((a, b) => a.priceVnd - b.priceVnd),
    [plans.data],
  );
  const proPlan = useMemo(
    () => sortedPlans.find((plan) => plan.tier === "pro"),
    [sortedPlans],
  );

  const tier = mine.data?.tier ?? "free";
  const isPro = tier === "pro";
  const back = <BackRow label={t("common.back")} onPress={() => router.back()} />;

  if (plans.isLoading || mine.isLoading) {
    return (
      <Screen>
        {back}
        <LoadingState label={t("common.loading")} />
      </Screen>
    );
  }

  if (plans.isError) {
    return (
      <Screen>
        {back}
        <ErrorState
          title={t("states.errorTitle")}
          body={resolveErrorMessage(plans.error, t) ?? t("states.errorBody")}
          retryLabel={t("common.retry")}
          onRetry={() => plans.refetch()}
          testID="paywall-error"
        />
      </Screen>
    );
  }

  const requestUpgrade = () => {
    if (!proPlan) return;
    requestActivation.mutate(proPlan.id, {
      // The result is always contact-required in v1 — surface the info sheet.
      onSuccess: () => setContactVisible(true),
    });
  };

  return (
    <Screen testID="paywall-screen">
      {back}

      <Text variant="heading-l" color="text" style={styles.title}>
        {t("paywall.title")}
      </Text>
      <Text variant="body-m" color="text-muted">
        {t("paywall.subtitle")}
      </Text>
      <Text
        variant="label-m"
        color={isPro ? "success" : "text-muted"}
        style={styles.currentLine}
        testID="paywall-current"
      >
        {isPro ? t("paywall.currentPro") : t("paywall.currentFree")}
      </Text>

      <View style={styles.plans}>
        {sortedPlans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            isCurrent={plan.tier === tier}
            isRecommended={plan.tier === "pro"}
            testID={`paywall-plan-${plan.tier}`}
          />
        ))}
      </View>

      {isPro ? (
        <View style={styles.actions}>
          <Button
            label={t("paywall.cancelCta")}
            variant="secondary"
            loading={cancel.isPending}
            onPress={() => cancel.mutate()}
            testID="paywall-cancel"
          />
          {cancel.isSuccess ? (
            <Text variant="body-m" color="success" center testID="paywall-canceled">
              {t("paywall.canceled")}
            </Text>
          ) : null}
        </View>
      ) : proPlan ? (
        <View style={styles.actions}>
          <Button
            label={t("paywall.upgradeCta")}
            icon="sparkles"
            loading={requestActivation.isPending}
            onPress={requestUpgrade}
            testID="paywall-upgrade"
          />
          <Text variant="caption" color="text-subtle" center>
            {t("paywall.inertNote")}
          </Text>
        </View>
      ) : null}

      <ContactSheet
        visible={contactVisible}
        onClose={() => setContactVisible(false)}
      />
    </Screen>
  );
}

/** Ghost back button row, matching the other stack screens. */
function BackRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <View style={styles.top}>
      <Button
        label={label}
        variant="ghost"
        fullWidth={false}
        icon="chevron-left"
        onPress={onPress}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  top: { alignItems: "flex-start", paddingTop: theme.spacing[8] },
  title: { marginTop: theme.spacing[8] },
  currentLine: { marginTop: theme.spacing[12] },
  plans: { marginTop: theme.spacing[20], gap: theme.spacing[16] },
  actions: { marginTop: theme.spacing[24], gap: theme.spacing[12] },
});
