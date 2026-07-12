import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  selfActivateSchema,
  type MySubscriptionResponse,
  type SelfActivateInput,
  type SelfActivateResult,
  type SubscriptionPlanResponse,
} from "@kitchenpal/api-contract";
import type { AuthUser } from "../../common/scope/auth-user";
import { CurrentUser } from "../../common/scope/current-user.decorator";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { SubscriptionsService } from "./services/subscriptions.service";

/**
 * Public subscription surface. Users can browse plans and read their own
 * subscription. Self-activation is INERT in v1 (monetization is admin-assigned):
 * it returns a contact-required result rather than creating a paid subscription,
 * so the Paywall CTA never implies a purchase. Cancellation is a real opt-out.
 */
@ApiTags("subscriptions")
@ApiBearerAuth()
@Controller("subscriptions")
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Get("plans")
  @ApiOperation({ summary: "List active subscription plans" })
  listPlans(): Promise<{ plans: SubscriptionPlanResponse[] }> {
    return this.subscriptions
      .listActivePlans()
      .then((plans) => ({ plans }));
  }

  @Get("me")
  @ApiOperation({ summary: "Get the caller's current subscription" })
  getMine(@CurrentUser() user: AuthUser): Promise<MySubscriptionResponse> {
    return this.subscriptions.getMine(user.id);
  }

  @Post("me/activate")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Request activation (inert in v1 — returns a contact CTA)",
  })
  activate(
    @Body(new ZodValidationPipe(selfActivateSchema)) body: SelfActivateInput,
  ): Promise<SelfActivateResult> {
    return this.subscriptions.selfActivate(body.planId);
  }

  @Post("me/cancel")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Cancel (opt out of) the caller's subscription" })
  cancel(@CurrentUser() user: AuthUser): Promise<MySubscriptionResponse> {
    return this.subscriptions.cancelForUser(user.id);
  }
}
