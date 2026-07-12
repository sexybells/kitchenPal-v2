import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  CreatePlanInput,
  MySubscriptionResponse,
  SelfActivateResult,
  SubscriptionPlanResponse,
  UpdatePlanInput,
  UserSubscriptionResponse,
} from "@kitchenpal/api-contract";
import type { HydratedDocument } from "mongoose";
import { ErrorCode } from "../../../common/http/error-codes";
import {
  SubscriptionPlanEntity,
  SubscriptionPlanRepository,
} from "../repositories/subscription-plan.repository";
import {
  UserSubscriptionEntity,
  UserSubscriptionRepository,
} from "../repositories/user-subscription.repository";

type PlanDoc = HydratedDocument<SubscriptionPlanEntity>;
type SubDoc = HydratedDocument<UserSubscriptionEntity>;

/**
 * Subscription plans and per-user assignments. Monetization is admin-only in v1:
 * the public surface can browse plans and read the caller's own subscription,
 * but self-activation is INERT (never creates a paid subscription). Real
 * assignment happens through the admin path, which calls {@link assignToUser}.
 */
@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly plans: SubscriptionPlanRepository,
    private readonly subscriptions: UserSubscriptionRepository,
  ) {}

  // --- Public reads -----------------------------------------------------

  async listActivePlans(): Promise<SubscriptionPlanResponse[]> {
    const plans = await this.plans.listActive();
    return plans.map(toPlanResponse);
  }

  async getMine(userId: string): Promise<MySubscriptionResponse> {
    const active = await this.resolveActive(userId);
    if (!active) {
      return { tier: "free", subscription: null };
    }
    const plan = await this.plans.findById(active.planId.toString());
    return {
      tier: plan ? plan.tier : "pro",
      subscription: toSubscriptionResponse(active, plan),
    };
  }

  /**
   * Self-activation stub. Deliberately does NOT create a subscription: v1 has no
   * payment provider, so the mobile Paywall shows a "contact us" CTA instead of
   * implying a purchase. The requested plan must exist so the client can surface
   * the right plan name.
   */
  async selfActivate(planId: string): Promise<SelfActivateResult> {
    const plan = await this.plans.findById(planId);
    if (!plan || !plan.active) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: "Subscription plan not found",
        details: { planId },
      });
    }
    return {
      activated: false,
      status: "contact_required",
      message:
        "Upgrades are handled by our team during the current phase. Please contact support to activate this plan.",
    };
  }

  /** A user opting out of their own active subscription (a downgrade, not a purchase). */
  async cancelForUser(userId: string): Promise<MySubscriptionResponse> {
    const active = await this.resolveActive(userId);
    if (active) {
      await this.subscriptions.updateWithVersion(
        active.id,
        active.version,
        { status: "canceled", endAt: new Date() },
        userId,
      );
    }
    return { tier: "free", subscription: null };
  }

  // --- Admin plan management --------------------------------------------

  async listAllPlans(): Promise<SubscriptionPlanResponse[]> {
    const plans = await this.plans.listAll();
    return plans.map(toPlanResponse);
  }

  async createPlan(
    actorId: string,
    input: CreatePlanInput,
  ): Promise<SubscriptionPlanResponse> {
    const plan = await this.plans.create(
      {
        name: input.name,
        tier: input.tier,
        priceVnd: input.priceVnd,
        features: input.features,
        active: input.active,
      },
      actorId,
    );
    return toPlanResponse(plan);
  }

  async updatePlan(
    actorId: string,
    planId: string,
    input: UpdatePlanInput,
  ): Promise<SubscriptionPlanResponse> {
    const plan = await this.requirePlan(planId);
    const updated = await this.plans.updateWithVersion(
      plan.id,
      plan.version,
      { ...input },
      actorId,
    );
    return toPlanResponse(updated);
  }

  // --- Admin assignment (source=admin) ----------------------------------

  /**
   * Assigns a plan to a user. Any existing active subscription is canceled first
   * so a user has at most one active row. Returns the newly created assignment.
   */
  async assignToUser(
    actorId: string,
    userId: string,
    planId: string,
    endAt: Date | null,
  ): Promise<UserSubscriptionResponse> {
    const plan = await this.requirePlan(planId);
    const existing = await this.resolveActive(userId);
    if (existing) {
      await this.subscriptions.updateWithVersion(
        existing.id,
        existing.version,
        { status: "canceled", endAt: new Date() },
        actorId,
      );
    }
    const created = await this.subscriptions.create(
      {
        userId,
        planId: plan.id,
        status: "active",
        source: "admin",
        startAt: new Date(),
        endAt,
      } as unknown as Partial<UserSubscriptionEntity>,
      actorId,
    );
    return toSubscriptionResponse(created, plan);
  }

  /** Admin cancels a user's active subscription. */
  async cancelForUserAsAdmin(
    actorId: string,
    userId: string,
  ): Promise<{ canceled: boolean }> {
    const active = await this.resolveActive(userId);
    if (!active) {
      return { canceled: false };
    }
    await this.subscriptions.updateWithVersion(
      active.id,
      active.version,
      { status: "canceled", endAt: new Date() },
      actorId,
    );
    return { canceled: true };
  }

  countActiveSubscriptions(): Promise<number> {
    return this.subscriptions.countActive();
  }

  // --- Internals --------------------------------------------------------

  /**
   * Returns the user's active subscription, lazily expiring one whose `endAt`
   * has passed so a lapsed term is not reported as active.
   */
  private async resolveActive(userId: string): Promise<SubDoc | null> {
    const active = await this.subscriptions.findActiveForUser(userId);
    if (!active) {
      return null;
    }
    if (active.endAt && active.endAt.getTime() <= Date.now()) {
      await this.subscriptions.updateWithVersion(
        active.id,
        active.version,
        { status: "expired" },
        userId,
      );
      return null;
    }
    return active;
  }

  private async requirePlan(planId: string): Promise<PlanDoc> {
    const plan = await this.plans.findById(planId);
    if (!plan) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: "Subscription plan not found",
        details: { planId },
      });
    }
    return plan;
  }
}

export function toPlanResponse(doc: PlanDoc): SubscriptionPlanResponse {
  return {
    id: doc.id,
    name: doc.name,
    tier: doc.tier,
    priceVnd: doc.priceVnd,
    features: doc.features,
    active: doc.active,
    version: doc.version,
    createdAt: (doc.createdAt ?? new Date()).toISOString(),
    updatedAt: (doc.updatedAt ?? new Date()).toISOString(),
  };
}

export function toSubscriptionResponse(
  doc: SubDoc,
  plan: PlanDoc | null,
): UserSubscriptionResponse {
  return {
    id: doc.id,
    userId: doc.userId.toString(),
    planId: doc.planId.toString(),
    plan: plan ? toPlanResponse(plan) : null,
    status: doc.status,
    source: doc.source,
    startAt: doc.startAt.toISOString(),
    endAt: doc.endAt ? doc.endAt.toISOString() : null,
    createdAt: (doc.createdAt ?? new Date()).toISOString(),
    updatedAt: (doc.updatedAt ?? new Date()).toISOString(),
  };
}
