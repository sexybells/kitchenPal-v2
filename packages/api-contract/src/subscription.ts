import { z } from "zod";
import { objectIdSchema } from "./pantry.js";

/**
 * Subscription tiers. `free` is the implicit default for every account; `pro`
 * unlocks premium features. Monetization is admin-assigned in v1 — there is no
 * self-serve purchase — so the tier set stays intentionally small.
 */
export const subscriptionTierSchema = z.enum(["free", "pro"]);
export type SubscriptionTier = z.infer<typeof subscriptionTierSchema>;

/**
 * Lifecycle of a user's subscription. `active` grants the plan's features;
 * `canceled` was ended deliberately; `expired` lapsed past its end date.
 */
export const subscriptionStatusSchema = z.enum([
  "active",
  "canceled",
  "expired",
]);
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;

/**
 * How a subscription came to exist. Only `admin` is used in v1 (an admin assigns
 * Pro); `system` is reserved for the implicit free baseline. No `purchase`
 * source exists until a real payment phase ships.
 */
export const subscriptionSourceSchema = z.enum(["admin", "system"]);
export type SubscriptionSource = z.infer<typeof subscriptionSourceSchema>;

/** A purchasable/assignable plan. Prices are stored in Vietnamese dong (VND). */
export const subscriptionPlanResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  tier: subscriptionTierSchema,
  /** Whole VND (no minor units); 0 for the free plan. */
  priceVnd: z.number().int().nonnegative(),
  features: z.array(z.string()),
  active: z.boolean(),
  version: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SubscriptionPlanResponse = z.infer<
  typeof subscriptionPlanResponseSchema
>;

/** A user's current or past subscription to a plan. */
export const userSubscriptionResponseSchema = z.object({
  id: z.string(),
  userId: z.string(),
  planId: z.string(),
  /** Denormalized plan snapshot when resolvable, else null. */
  plan: subscriptionPlanResponseSchema.nullable(),
  status: subscriptionStatusSchema,
  source: subscriptionSourceSchema,
  startAt: z.string(),
  /** Null = open-ended (no scheduled expiry). */
  endAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type UserSubscriptionResponse = z.infer<
  typeof userSubscriptionResponseSchema
>;

/** The caller's subscription view: the active subscription (if any) + tier. */
export const mySubscriptionResponseSchema = z.object({
  tier: subscriptionTierSchema,
  subscription: userSubscriptionResponseSchema.nullable(),
});
export type MySubscriptionResponse = z.infer<
  typeof mySubscriptionResponseSchema
>;

/**
 * Self-activation is INERT in v1: it never creates a paid subscription. It
 * returns a contact-required result so the mobile Paywall can show a "liên hệ"
 * (contact us) CTA without implying a real purchase.
 */
export const selfActivateSchema = z.object({
  planId: objectIdSchema,
});
export type SelfActivateInput = z.infer<typeof selfActivateSchema>;

export const selfActivateResultSchema = z.object({
  activated: z.literal(false),
  status: z.literal("contact_required"),
  message: z.string(),
});
export type SelfActivateResult = z.infer<typeof selfActivateResultSchema>;

// --- Admin plan + assignment management ---------------------------------

/** Create a subscription plan (admin only). */
export const createPlanSchema = z.object({
  name: z.string().min(1).max(120),
  tier: subscriptionTierSchema,
  priceVnd: z.number().int().nonnegative().max(1_000_000_000),
  features: z.array(z.string().min(1).max(200)).max(50).default([]),
  active: z.boolean().default(true),
});
export type CreatePlanInput = z.infer<typeof createPlanSchema>;

/** Partial update of a plan (admin only). Optimistic-lock via `version`. */
export const updatePlanSchema = createPlanSchema.partial();
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;

/**
 * Assign (or replace) a user's subscription (admin only, `source=admin`).
 * `endAt` bounds a trial/term; omit for open-ended access.
 */
export const assignSubscriptionSchema = z.object({
  userId: objectIdSchema,
  planId: objectIdSchema,
  endAt: z.string().datetime().nullable().optional(),
});
export type AssignSubscriptionInput = z.infer<typeof assignSubscriptionSchema>;
