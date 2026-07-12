import { Controller, Get, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  reportRangeQuerySchema,
  type AiCostReport,
  type AiTrendReport,
  type GrowthReport,
  type ReportRangeQuery,
  type UsageReport,
} from "@kitchenpal/api-contract";
import { Roles } from "../../../common/scope/roles.decorator";
import { ZodValidationPipe } from "../../../common/validation/zod-validation.pipe";
import { AdminReportsService } from "../services/admin-reports.service";

/** Admin reporting: usage snapshot, growth, AI trend, and AI cost aggregation. */
@ApiTags("admin")
@ApiBearerAuth()
@Roles("admin")
@Controller("admin/reports")
export class AdminReportsController {
  constructor(private readonly reports: AdminReportsService) {}

  @Get("usage")
  @ApiOperation({ summary: "Current usage counts snapshot" })
  usage(): Promise<UsageReport> {
    return this.reports.usage();
  }

  @Get("growth")
  @ApiOperation({ summary: "New users/households over time" })
  growth(
    @Query(new ZodValidationPipe(reportRangeQuerySchema)) query: ReportRangeQuery,
  ): Promise<GrowthReport> {
    return this.reports.growth(query);
  }

  @Get("ai-trend")
  @ApiOperation({ summary: "AI calls over time" })
  aiTrend(
    @Query(new ZodValidationPipe(reportRangeQuerySchema)) query: ReportRangeQuery,
  ): Promise<AiTrendReport> {
    return this.reports.aiTrend(query);
  }

  @Get("ai-costs")
  @ApiOperation({ summary: "AI token/cost aggregation by provider" })
  aiCosts(
    @Query(new ZodValidationPipe(reportRangeQuerySchema)) query: ReportRangeQuery,
  ): Promise<AiCostReport> {
    return this.reports.aiCosts(query);
  }
}
