import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { AuthModule } from "../auth/auth.module";
import { SubscriptionPlanRepository } from "./repositories/subscription-plan.repository";
import { UserSubscriptionRepository } from "./repositories/user-subscription.repository";
import {
  SubscriptionPlan,
  SubscriptionPlanSchema,
} from "./schemas/subscription-plan.schema";
import {
  UserSubscription,
  UserSubscriptionSchema,
} from "./schemas/user-subscription.schema";
import { SubscriptionsController } from "./subscriptions.controller";
import { SubscriptionsService } from "./services/subscriptions.service";

/**
 * Subscription plans and per-user assignments. Exposes the public read/inert
 * surface here; the admin module consumes {@link SubscriptionsService} for plan
 * CRUD and admin-only assignment. Exports the service and repositories so the
 * admin console and usage reports can reuse them.
 */
@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: SubscriptionPlan.name, schema: SubscriptionPlanSchema },
      { name: UserSubscription.name, schema: UserSubscriptionSchema },
    ]),
  ],
  controllers: [SubscriptionsController],
  providers: [
    SubscriptionsService,
    SubscriptionPlanRepository,
    UserSubscriptionRepository,
  ],
  exports: [
    SubscriptionsService,
    SubscriptionPlanRepository,
    UserSubscriptionRepository,
  ],
})
export class SubscriptionsModule {}
