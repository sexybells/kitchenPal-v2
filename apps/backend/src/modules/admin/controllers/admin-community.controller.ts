import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  adminCommunityReportQuerySchema,
  objectIdSchema,
  type AdminCommunityReportQuery,
  type AdminCommunityReportResponse,
} from "@kitchenpal/api-contract";
import type { PageResult } from "../../../common/http/page-result";
import type { AuthUser } from "../../../common/scope/auth-user";
import { CurrentUser } from "../../../common/scope/current-user.decorator";
import { Roles } from "../../../common/scope/roles.decorator";
import { ZodValidationPipe } from "../../../common/validation/zod-validation.pipe";
import { AdminCommunityService } from "../services/admin-community.service";

/**
 * Admin moderation of the community feed. Strictly `admin`-role-gated; every
 * action (remove post/comment, dismiss report) is audit-logged in the service.
 */
@ApiTags("admin")
@ApiBearerAuth()
@Roles("admin")
@Controller("admin/community")
export class AdminCommunityController {
  constructor(private readonly community: AdminCommunityService) {}

  @Get("reports")
  @ApiOperation({ summary: "List moderation reports by status" })
  listReports(
    @Query(new ZodValidationPipe(adminCommunityReportQuerySchema))
    query: AdminCommunityReportQuery,
  ): Promise<PageResult<AdminCommunityReportResponse>> {
    return this.community.listReports(query);
  }

  @Post("posts/:id/remove")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Remove a post and mark its open reports reviewed" })
  async removePost(
    @CurrentUser() actor: AuthUser,
    @Param("id", new ZodValidationPipe(objectIdSchema)) id: string,
  ): Promise<{ removed: boolean }> {
    await this.community.removePost(actor.id, id);
    return { removed: true };
  }

  @Post("comments/:id/remove")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Remove a comment and mark its open reports reviewed",
  })
  async removeComment(
    @CurrentUser() actor: AuthUser,
    @Param("id", new ZodValidationPipe(objectIdSchema)) id: string,
  ): Promise<{ removed: boolean }> {
    await this.community.removeComment(actor.id, id);
    return { removed: true };
  }

  @Post("reports/:id/dismiss")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Dismiss a report without removing its target" })
  async dismissReport(
    @CurrentUser() actor: AuthUser,
    @Param("id", new ZodValidationPipe(objectIdSchema)) id: string,
  ): Promise<{ dismissed: boolean }> {
    await this.community.dismissReport(actor.id, id);
    return { dismissed: true };
  }
}
