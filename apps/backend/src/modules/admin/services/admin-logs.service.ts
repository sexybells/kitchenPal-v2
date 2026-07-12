import { Injectable } from "@nestjs/common";
import type {
  AdminAiLogResponse,
  AdminExternalSearchLogResponse,
  AdminListQuery,
} from "@kitchenpal/api-contract";
import type { HydratedDocument } from "mongoose";
import { PageResult } from "../../../common/http/page-result";
import type { BaseDocumentFields } from "../../../common/database/base.schema";
import type { AiLog } from "../../logs/schemas/ai-log.schema";
import type { ExternalSearchLog } from "../../logs/schemas/external-search-log.schema";
import {
  AdminAiLogReadRepository,
  AdminExternalSearchLogReadRepository,
} from "../repositories/admin-read.repository";
import { buildPage } from "./admin-audit.service";
import { decodeCursor } from "./admin-pagination";

type AiLogEntity = AiLog & BaseDocumentFields;
type ExternalLogEntity = ExternalSearchLog & BaseDocumentFields;

/** Read-only admin viewers for the AI and external-search audit trails. */
@Injectable()
export class AdminLogsService {
  constructor(
    private readonly aiLogs: AdminAiLogReadRepository,
    private readonly externalLogs: AdminExternalSearchLogReadRepository,
  ) {}

  async listAiLogs(
    query: AdminListQuery,
  ): Promise<PageResult<AdminAiLogResponse>> {
    const skip = decodeCursor(query.cursor);
    const { items, total } = await this.aiLogs.paginate(
      {},
      { createdAt: -1 },
      skip,
      query.limit,
    );
    return buildPage(items.map(toAiLogResponse), skip, total);
  }

  async listExternalSearchLogs(
    query: AdminListQuery,
  ): Promise<PageResult<AdminExternalSearchLogResponse>> {
    const skip = decodeCursor(query.cursor);
    const { items, total } = await this.externalLogs.paginate(
      {},
      { createdAt: -1 },
      skip,
      query.limit,
    );
    return buildPage(items.map(toExternalLogResponse), skip, total);
  }
}

function toAiLogResponse(
  doc: HydratedDocument<AiLogEntity>,
): AdminAiLogResponse {
  return {
    id: doc.id,
    provider: doc.provider,
    operation: doc.operation,
    success: doc.success,
    latencyMs: doc.latencyMs ?? null,
    promptTokens: doc.promptTokens ?? null,
    completionTokens: doc.completionTokens ?? null,
    costUsd: doc.costUsd ?? null,
    userId: doc.userId ? doc.userId.toString() : null,
    createdAt: (doc.createdAt ?? new Date()).toISOString(),
  };
}

function toExternalLogResponse(
  doc: HydratedDocument<ExternalLogEntity>,
): AdminExternalSearchLogResponse {
  return {
    id: doc.id,
    provider: doc.provider,
    operation: doc.operation,
    query: doc.query,
    url: doc.url,
    success: doc.success,
    latencyMs: doc.latencyMs ?? null,
    userId: doc.userId ? doc.userId.toString() : null,
    createdAt: (doc.createdAt ?? new Date()).toISOString(),
  };
}
