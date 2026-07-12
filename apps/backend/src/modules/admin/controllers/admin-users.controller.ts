import { Body, Controller, Get, Param, Patch, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  adminListQuerySchema,
  adminSuspendUserSchema,
  adminUpdateRolesSchema,
  objectIdSchema,
  type AdminListQuery,
  type AdminSuspendUserInput,
  type AdminUpdateRolesInput,
  type AdminUserResponse,
} from "@kitchenpal/api-contract";
import type { AuthUser } from "../../../common/scope/auth-user";
import type { PageResult } from "../../../common/http/page-result";
import { CurrentUser } from "../../../common/scope/current-user.decorator";
import { Roles } from "../../../common/scope/roles.decorator";
import { ZodValidationPipe } from "../../../common/validation/zod-validation.pipe";
import { AdminUsersService } from "../services/admin-users.service";

/** Admin user management. Strictly `admin`-role-gated; reads span all tenants. */
@ApiTags("admin")
@ApiBearerAuth()
@Roles("admin")
@Controller("admin/users")
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  @ApiOperation({ summary: "List/search users across all tenants" })
  list(
    @Query(new ZodValidationPipe(adminListQuerySchema)) query: AdminListQuery,
  ): Promise<PageResult<AdminUserResponse>> {
    return this.users.list(query);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a user by id" })
  getById(
    @Param("id", new ZodValidationPipe(objectIdSchema)) id: string,
  ): Promise<AdminUserResponse> {
    return this.users.getById(id);
  }

  @Patch(":id/roles")
  @ApiOperation({ summary: "Replace a user's role set" })
  updateRoles(
    @CurrentUser() actor: AuthUser,
    @Param("id", new ZodValidationPipe(objectIdSchema)) id: string,
    @Body(new ZodValidationPipe(adminUpdateRolesSchema))
    body: AdminUpdateRolesInput,
  ): Promise<AdminUserResponse> {
    return this.users.updateRoles(actor.id, id, body);
  }

  @Patch(":id/suspend")
  @ApiOperation({ summary: "Suspend or reinstate a user" })
  suspend(
    @CurrentUser() actor: AuthUser,
    @Param("id", new ZodValidationPipe(objectIdSchema)) id: string,
    @Body(new ZodValidationPipe(adminSuspendUserSchema))
    body: AdminSuspendUserInput,
  ): Promise<AdminUserResponse> {
    return this.users.setSuspended(actor.id, id, body);
  }
}
