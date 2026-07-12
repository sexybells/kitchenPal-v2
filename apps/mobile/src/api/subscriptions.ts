import { z } from "zod";
import {
  mySubscriptionResponseSchema,
  selfActivateResultSchema,
  subscriptionPlanResponseSchema,
  type MySubscriptionResponse,
  type SelfActivateResult,
  type SubscriptionPlanResponse,
} from "@kitchenpal/api-contract";
import { api } from "./api";

/** The plans endpoint wraps the list in a `{ plans }` object inside the envelope. */
const plansResponseSchema = z.object({
  plans: z.array(subscriptionPlanResponseSchema),
});

/**
 * Subscription endpoint wrappers. Monetization is admin-assigned in v1, so
 * `activate` is INERT — it returns a contact-required result and never creates a
 * paid subscription. `cancel` is a real self opt-out (a downgrade to free). All
 * routes are personal-scoped and require the access token.
 */
export const subscriptionsApi = {
  listPlans: (): Promise<SubscriptionPlanResponse[]> =>
    api
      .request("subscriptions/plans", {
        method: "GET",
        auth: true,
        schema: plansResponseSchema,
      })
      .then((result) => result.plans),

  mine: (): Promise<MySubscriptionResponse> =>
    api.request("subscriptions/me", {
      method: "GET",
      auth: true,
      schema: mySubscriptionResponseSchema,
    }),

  activate: (planId: string): Promise<SelfActivateResult> =>
    api.request("subscriptions/me/activate", {
      body: { planId },
      auth: true,
      schema: selfActivateResultSchema,
    }),

  cancel: (): Promise<MySubscriptionResponse> =>
    api.request("subscriptions/me/cancel", {
      method: "POST",
      auth: true,
      schema: mySubscriptionResponseSchema,
    }),
};
