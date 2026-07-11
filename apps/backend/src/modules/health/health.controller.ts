import { Controller, Get, Query } from "@nestjs/common";
import {
  paginationQuerySchema,
  type PaginationQuery,
} from "@kitchenpal/api-contract";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { HealthReport, HealthService } from "./health.service";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @ApiOperation({ summary: "Liveness and MongoDB connectivity" })
  @ApiOkResponse({ description: "Service health wrapped in the response envelope" })
  check(): HealthReport {
    return this.health.check();
  }

  @Get("ready")
  @ApiOperation({ summary: "Readiness probe" })
  ready(): HealthReport {
    return this.health.check();
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
