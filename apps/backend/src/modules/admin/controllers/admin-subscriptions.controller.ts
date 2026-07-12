import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  assignSubscriptionSchema,
  createPlanSchema,
  objectIdSchema,
  updatePlanSchema,
  type AssignSubscriptionInput,
  type CreatePlanInput,
  type SubscriptionPlanResponse,
  type UpdatePlanInput,
  type UserSubscriptionResponse,
} from "@kitchenpal/api-contract";
import type { AuthUser } from "../../../common/scope/auth-user";
import { CurrentUser } from "../../../common/scope/current-user.decorator";
import { Roles } from "../../../common/scope/roles.decorator";
import { ZodValidationPipe } from "../../../common/validation/zod-validation.pipe";
import { AdminSubscriptionsService } from "../services/admin-subscriptions.service";

/**
 * Admin subscription management: plan CRUD and per-user assignment/cancel
 * (`source=admin`). This is the only real path to a paid subscription in v1.
 * Every mutation is audit-logged.
 */
@ApiTags("admin")
@ApiBearerAuth()
@Roles("admin")
@Controller("admin/subscriptions")
export class AdminSubscriptionsController {
  constructor(private readonly subscriptions: AdminSubscriptionsService) {}

  @Get("plans")
  @ApiOperation({ summary: "List all subscription plans (incl. inactive)" })
  listPlans(): Promise<{ plans: SubscriptionPlanResponse[] }> {
    return this.subscriptions.listPlans().then((plans) => ({ plans }));
  }

  @Post("plans")
  @ApiOperation({ summary: "Create a subscription plan" })
  createPlan(
    @CurrentUser() actor: AuthUser,
    @Body(new ZodValidationPipe(createPlanSchema)) body: CreatePlanInput,
  ): Promise<SubscriptionPlanResponse> {
    return this.subscriptions.createPlan(actor.id, body);
  }

  @Patch("plans/:id")
  @ApiOperation({ summary: "Update a subscription plan" })
  updatePlan(
    @CurrentUser() actor: AuthUser,
    @Param("id", new ZodValidationPipe(objectIdSchema)) id: string,
    @Body(new ZodValidationPipe(updatePlanSchema)) body: UpdatePlanInput,
  ): Promise<SubscriptionPlanResponse> {
    return this.subscriptions.updatePlan(actor.id, id, body);
  }

  @Post("assign")
  @ApiOperation({ summary: "Assign a plan to a user (source=admin)" })
  assign(
    @CurrentUser() actor: AuthUser,
    @Body(new ZodValidationPipe(assignSubscriptionSchema))
    body: AssignSubscriptionInput,
  ): Promise<UserSubscriptionResponse> {
    return this.subscriptions.assign(actor.id, body);
  }

  @Post("users/:userId/cancel")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Cancel a user's active subscription" })
  cancel(
    @CurrentUser() actor: AuthUser,
    @Param("userId", new ZodValidationPipe(objectIdSchema)) userId: string,
  ): Promise<{ canceled: boolean }> {
    return this.subscriptions.cancel(actor.id, userId);
  }
}
