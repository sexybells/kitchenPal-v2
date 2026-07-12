import { Controller, Get, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  adminListQuerySchema,
  type AdminAiLogResponse,
  type AdminAuditLogResponse,
  type AdminExternalSearchLogResponse,
  type AdminListQuery,
} from "@kitchenpal/api-contract";
import type { PageResult } from "../../../common/http/page-result";
import { Roles } from "../../../common/scope/roles.decorator";
import { ZodValidationPipe } from "../../../common/validation/zod-validation.pipe";
import { AdminAuditService } from "../services/admin-audit.service";
import { AdminLogsService } from "../services/admin-logs.service";

/** Admin log viewers: AI calls, external searches, and the admin audit trail. */
@ApiTags("admin")
@ApiBearerAuth()
@Roles("admin")
@Controller("admin/logs")
export class AdminLogsController {
  constructor(
    private readonly logs: AdminLogsService,
    private readonly audit: AdminAuditService,
  ) {}

  @Get("ai")
  @ApiOperation({ summary: "List AI provider call logs" })
  listAi(
    @Query(new ZodValidationPipe(adminListQuerySchema)) query: AdminListQuery,
  ): Promise<PageResult<AdminAiLogResponse>> {
    return this.logs.listAiLogs(query);
  }

  @Get("external-search")
  @ApiOperation({ summary: "List external-search / scrape logs" })
  listExternal(
    @Query(new ZodValidationPipe(adminListQuerySchema)) query: AdminListQuery,
  ): Promise<PageResult<AdminExternalSearchLogResponse>> {
    return this.logs.listExternalSearchLogs(query);
  }

  @Get("audit")
  @ApiOperation({ summary: "List the admin audit trail" })
  listAudit(
    @Query(new ZodValidationPipe(adminListQuerySchema)) query: AdminListQuery,
  ): Promise<PageResult<AdminAuditLogResponse>> {
    return this.audit.list(query.cursor, query.limit);
  }
}
