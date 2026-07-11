import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  biometricSettingSchema,
  pushTokenSchema,
  updateSettingsSchema,
  updateTipsSchema,
  type BiometricSettingInput,
  type PushTokenInput,
  type TipsStateResponse,
  type UpdateSettingsInput,
  type UpdateTipsInput,
  type UserSettingsResponse,
} from "@kitchenpal/api-contract";
import { CurrentScope, Scope } from "../../common/scope/scope.decorator";
import { Roles } from "../../common/scope/roles.decorator";
import { RolesGuard } from "../../common/scope/roles.guard";
import type { ScopeContext } from "../../common/scope/scope-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { UsersService } from "./users.service";

/**
 * Per-user account endpoints. All personal-data routes declare `@Scope("personal")`
 * so the scope guard resolves an owner-bound {@link ScopeContext}; the admin
 * route is gated by the role guard instead.
 */
@ApiTags("users")
@ApiBearerAuth()
@Controller("users")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get("settings")
  @Scope("personal")
  @ApiOperation({ summary: "Get the current user's settings" })
  getSettings(
    @CurrentScope() scope: ScopeContext,
  ): Promise<UserSettingsResponse> {
    return this.users.getSettings(scope);
  }

  @Patch("settings")
  @Scope("personal")
  @ApiOperation({ summary: "Update the current user's settings" })
  updateSettings(
    @CurrentScope() scope: ScopeContext,
    @Body(new ZodValidationPipe(updateSettingsSchema)) body: UpdateSettingsInput,
  ): Promise<UserSettingsResponse> {
    return this.users.updateSettings(scope, body);
  }

  @Patch("settings/biometric")
  @Scope("personal")
  @ApiOperation({ summary: "Toggle the device biometric-lock preference" })
  setBiometric(
    @CurrentScope() scope: ScopeContext,
    @Body(new ZodValidationPipe(biometricSettingSchema))
    body: BiometricSettingInput,
  ): Promise<UserSettingsResponse> {
    return this.users.setBiometric(scope, body);
  }

  @Post("push-token")
  @Scope("personal")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Register a device push-notification token" })
  addPushToken(
    @CurrentScope() scope: ScopeContext,
    @Body(new ZodValidationPipe(pushTokenSchema)) body: PushTokenInput,
  ): Promise<UserSettingsResponse> {
    return this.users.addPushToken(scope, body);
  }

  @Get("tips")
  @Scope("personal")
  @ApiOperation({ summary: "Get onboarding-tips state" })
  getTips(@CurrentScope() scope: ScopeContext): Promise<TipsStateResponse> {
    return this.users.getTips(scope);
  }

  @Patch("tips")
  @Scope("personal")
  @ApiOperation({ summary: "Update onboarding-tips state" })
  updateTips(
    @CurrentScope() scope: ScopeContext,
    @Body(new ZodValidationPipe(updateTipsSchema)) body: UpdateTipsInput,
  ): Promise<TipsStateResponse> {
    return this.users.updateTips(scope, body);
  }

  @Get("admin/overview")
  @Roles("admin")
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: "Admin-only platform snapshot" })
  adminOverview(): Promise<{ userCount: number }> {
    return this.users.adminOverview();
  }
}
