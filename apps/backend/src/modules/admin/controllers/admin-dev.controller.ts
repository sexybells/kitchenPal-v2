import { Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { DevToolResult } from "@kitchenpal/api-contract";
import type { AuthUser } from "../../../common/scope/auth-user";
import { CurrentUser } from "../../../common/scope/current-user.decorator";
import { Roles } from "../../../common/scope/roles.decorator";
import { DevToolsService } from "../services/dev-tools.service";

/**
 * Guarded developer tools. Admin-role-gated AND hard-disabled in production by
 * {@link DevToolsService} — every action fails closed when `NODE_ENV=production`,
 * so seeding or resetting can never run against real data.
 */
@ApiTags("admin")
@ApiBearerAuth()
@Roles("admin")
@Controller("admin/dev")
export class AdminDevController {
  constructor(private readonly dev: DevToolsService) {}

  @Post("seed-plans")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Seed baseline subscription plans (non-prod only)" })
  seedPlans(@CurrentUser() actor: AuthUser): Promise<DevToolResult> {
    return this.dev.seedPlans(actor.id);
  }

  @Post("seed-recipes")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Seed baseline system recipes (non-prod only)" })
  seedRecipes(@CurrentUser() actor: AuthUser): Promise<DevToolResult> {
    return this.dev.seedRecipes(actor.id);
  }

  @Post("reset")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Reset dev-owned data (non-prod only)" })
  reset(@CurrentUser() actor: AuthUser): Promise<DevToolResult> {
    return this.dev.resetDevData(actor.id);
  }
}
