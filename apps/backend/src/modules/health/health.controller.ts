import {
  Controller,
  Get,
  Query,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  paginationQuerySchema,
  type PaginationQuery,
} from "@kitchenpal/api-contract";
import { ApiOkResponse, ApiOperation, ApiTags, ApiServiceUnavailableResponse } from "@nestjs/swagger";
import { ErrorCode } from "../../common/http/error-codes";
import { Public } from "../../common/scope/public.decorator";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { HealthReport, HealthService } from "./health.service";

@ApiTags("health")
@Public()
@Controller("health")
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @ApiOperation({ summary: "Liveness and MongoDB connectivity" })
  @ApiOkResponse({ description: "Service health wrapped in the response envelope" })
  check(): HealthReport {
    return this.health.check();
  }

  /**
   * Readiness probe for the deploy platform's health check (Fly/Railway). Unlike
   * `/health` (always 200, used for plain liveness), this returns 503 when Mongo
   * is not connected so the platform stops routing traffic to — and restarts —
   * an instance that cannot serve requests, instead of reporting it as healthy.
   */
  @Get("ready")
  @ApiOperation({ summary: "Readiness probe (503 when a dependency is down)" })
  @ApiOkResponse({ description: "Ready to serve traffic" })
  @ApiServiceUnavailableResponse({ description: "A required dependency (MongoDB) is unavailable" })
  ready(): HealthReport {
    const report = this.health.check();
    if (report.status !== "ok") {
      throw new ServiceUnavailableException({
        code: ErrorCode.SERVICE_UNAVAILABLE,
        message: "Not ready: MongoDB is not connected",
        details: report as unknown as Record<string, unknown>,
      });
    }
    return report;
  }

  /**
   * Diagnostic endpoint that validates its query against the shared
   * `paginationQuerySchema` and echoes the normalized result. Demonstrates the
   * zod validation pipe and the error envelope for invalid input.
   */
  @Get("echo")
  @ApiOperation({ summary: "Echo validated pagination query" })
  echo(
    @Query(new ZodValidationPipe(paginationQuerySchema))
    query: PaginationQuery,
  ): PaginationQuery {
    return query;
  }
}
