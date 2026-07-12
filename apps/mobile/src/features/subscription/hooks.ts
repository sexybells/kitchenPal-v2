import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { subscriptionsApi } from "../../api/subscriptions";

/** Subscription query keys — centralised so mutations invalidate consistently. */
export const subscriptionKeys = {
  all: ["subscription"] as const,
  plans: ["subscription", "plans"] as const,
  mine: ["subscription", "mine"] as const,
};

/** The active, purchasable plans (Free + Pro in v1). */
export const usePlans = () =>
  useQuery({
    queryKey: subscriptionKeys.plans,
    queryFn: () => subscriptionsApi.listPlans(),
  });

/** The caller's current subscription + resolved tier. */
export const useMySubscription = () =>
  useQuery({
    queryKey: subscriptionKeys.mine,
    queryFn: () => subscriptionsApi.mine(),
  });

/**
 * Request activation. INERT in v1: resolves to a contact-required result rather
 * than a purchase, so the Paywall shows a "contact us" message. Kept as a
 * mutation so the screen can reflect pending/error states like any other write.
 */
export const useRequestActivation = () =>
  useMutation({
    mutationFn: (planId: string) => subscriptionsApi.activate(planId),
  });

/** Cancel (opt out of) the current subscription — a real downgrade to free. */
export const useCancelSubscription = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => subscriptionsApi.cancel(),
    onSuccess: () => client.invalidateQueries({ queryKey: subscriptionKeys.mine }),
  });
};
