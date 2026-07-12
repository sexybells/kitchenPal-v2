import { Body, Controller, Get, Param, Put } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  integrationKeySchema,
  updateSettingSchema,
  type IntegrationKey,
  type SystemSettingResponse,
  type UpdateSettingInput,
} from "@kitchenpal/api-contract";
import type { AuthUser } from "../../../common/scope/auth-user";
import { CurrentUser } from "../../../common/scope/current-user.decorator";
import { Roles } from "../../../common/scope/roles.decorator";
import { ZodValidationPipe } from "../../../common/validation/zod-validation.pipe";
import { AdminSettingsService } from "../services/admin-settings.service";

/**
 * Integration settings (toggles + non-secret config). Never returns or accepts
 * secrets — those stay in environment variables. Updates are audit-logged.
 */
@ApiTags("admin")
@ApiBearerAuth()
@Roles("admin")
@Controller("admin/settings/integrations")
export class AdminSettingsController {
  constructor(private readonly settings: AdminSettingsService) {}

  @Get()
  @ApiOperation({ summary: "List integration toggles (secret-free)" })
  list(): Promise<{ settings: SystemSettingResponse[] }> {
    return this.settings.list().then((settings) => ({ settings }));
  }

  @Put(":key")
  @ApiOperation({ summary: "Update an integration toggle and non-secret config" })
  update(
    @CurrentUser() actor: AuthUser,
    @Param("key", new ZodValidationPipe(integrationKeySchema))
    key: IntegrationKey,
    @Body(new ZodValidationPipe(updateSettingSchema)) body: UpdateSettingInput,
  ): Promise<SystemSettingResponse> {
    return this.settings.update(actor.id, key, body);
  }
}
