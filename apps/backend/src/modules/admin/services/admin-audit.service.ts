import { Injectable } from "@nestjs/common";
import type { AdminAuditLogResponse } from "@kitchenpal/api-contract";
import type { HydratedDocument } from "mongoose";
import { AppLogger } from "../../../common/logging/app-logger.service";
import { PageResult, paginate } from "../../../common/http/page-result";
import { AdminAuditLogReadRepository } from "../repositories/admin-read.repository";
import type { AdminAuditLog } from "../../logs/schemas/admin-audit-log.schema";
import type { BaseDocumentFields } from "../../../common/database/base.schema";
import { decodeCursor, encodeCursor } from "./admin-pagination";

type AuditEntity = AdminAuditLog & BaseDocumentFields;
type AuditDoc = HydratedDocument<AuditEntity>;

/** What to record for an admin mutation. `before`/`after` must exclude secrets. */
export interface AdminAuditInput {
  action: string;
  targetType?: string;
  targetId?: string | null;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/**
 * Writes an immutable audit row for every privileged admin mutation: who
 * (actorId), what (action + target), when (timestamp), and a redacted
 * before/after summary. Centralized so all admin writes log consistently and
 * never leak secrets. Reads back the audit trail for the admin log viewer.
 */
@Injectable()
export class AdminAuditService {
  constructor(
    private readonly audit: AdminAuditLogReadRepository,
    private readonly logger: AppLogger,
  ) {}

  /**
   * Records an admin mutation. Called AFTER the mutation has already committed
   * (these admin paths are non-transactional), so it is BEST-EFFORT: a failed
   * audit insert is logged loudly but never re-thrown, so a successful mutation
   * is never turned into a 500 by an audit-write failure. The loud error log is
   * the fallback trail when the row could not be written.
   */
  async record(actorId: string, input: AdminAuditInput): Promise<void> {
    const metadata: Record<string, unknown> = { ...input.metadata };
    if (input.before !== undefined) {
      metadata.before = input.before;
    }
    if (input.after !== undefined) {
      metadata.after = input.after;
    }
    try {
      await this.audit.create(
        {
          actorId,
          action: input.action,
          targetType: input.targetType,
          targetId: input.targetId ?? undefined,
          metadata,
        } as unknown as Partial<AuditEntity>,
        actorId,
      );
    } catch (error) {
      this.logger.error(
        `Failed to write admin audit log for action "${input.action}" by ${actorId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
        "AdminAuditService",
      );
    }
  }

  async list(
    cursor: string | undefined,
    limit: number,
  ): Promise<PageResult<AdminAuditLogResponse>> {
    const skip = decodeCursor(cursor);
    const { items, total } = await this.audit.paginate(
      {},
      { createdAt: -1 },
      skip,
      limit,
    );
    return buildPage(items.map(toAuditResponse), skip, total);
  }
}

function toAuditResponse(doc: AuditDoc): AdminAuditLogResponse {
  return {
    id: doc.id,
    actorId: doc.actorId.toString(),
    action: doc.action,
    targetType: doc.targetType ?? null,
    targetId: doc.targetId ? doc.targetId.toString() : null,
    metadata: doc.metadata ?? null,
    createdAt: (doc.createdAt ?? new Date()).toISOString(),
  };
}

/** Shared page builder for admin listings (offset cursor). */
export function buildPage<T>(
  items: T[],
  skip: number,
  total: number,
): PageResult<T> {
  const nextSkip = skip + items.length;
  const hasMore = nextSkip < total;
  return paginate(items, {
    nextCursor: hasMore ? encodeCursor(nextSkip) : null,
    total,
  });
}
