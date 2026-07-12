import { Injectable } from "@nestjs/common";
import type {
  AssignSubscriptionInput,
  CreatePlanInput,
  SubscriptionPlanResponse,
  UpdatePlanInput,
  UserSubscriptionResponse,
} from "@kitchenpal/api-contract";
import { SubscriptionsService } from "../../subscriptions/services/subscriptions.service";
import { AdminAuditService } from "./admin-audit.service";

/**
 * Admin-only subscription management: plan CRUD and per-user assignment/cancel
 * (`source=admin`). Delegates persistence to {@link SubscriptionsService} and
 * audit-logs every mutation. This is the only real path to a paid subscription
 * in v1 — users cannot self-purchase.
 */
@Injectable()
export class AdminSubscriptionsService {
  constructor(
    private readonly subscriptions: SubscriptionsService,
    private readonly audit: AdminAuditService,
  ) {}

  listPlans(): Promise<SubscriptionPlanResponse[]> {
    return this.subscriptions.listAllPlans();
  }

  async createPlan(
    actorId: string,
    input: CreatePlanInput,
  ): Promise<SubscriptionPlanResponse> {
    const plan = await this.subscriptions.createPlan(actorId, input);
    await this.audit.record(actorId, {
      action: "plan.create",
      targetType: "subscription_plan",
      targetId: plan.id,
      after: { name: plan.name, tier: plan.tier, priceVnd: plan.priceVnd },
    });
    return plan;
  }

  async updatePlan(
    actorId: string,
    id: string,
    input: UpdatePlanInput,
  ): Promise<SubscriptionPlanResponse> {
    const plan = await this.subscriptions.updatePlan(actorId, id, input);
    await this.audit.record(actorId, {
      action: "plan.update",
      targetType: "subscription_plan",
      targetId: id,
      after: { fields: Object.keys(input) },
    });
    return plan;
  }

  async assign(
    actorId: string,
    input: AssignSubscriptionInput,
  ): Promise<UserSubscriptionResponse> {
    const endAt = input.endAt ? new Date(input.endAt) : null;
    const subscription = await this.subscriptions.assignToUser(
      actorId,
      input.userId,
      input.planId,
      endAt,
    );
    await this.audit.record(actorId, {
      action: "subscription.assign",
      targetType: "user",
      targetId: input.userId,
      after: { planId: input.planId, endAt: subscription.endAt },
    });
    return subscription;
  }

  async cancel(actorId: string, userId: string): Promise<{ canceled: boolean }> {
    const result = await this.subscriptions.cancelForUserAsAdmin(
      actorId,
      userId,
    );
    await this.audit.record(actorId, {
      action: "subscription.cancel",
      targetType: "user",
      targetId: userId,
      after: { canceled: result.canceled },
    });
    return result;
  }
}
