import { Injectable, NotFoundException } from "@nestjs/common";
import type {
  AdminListQuery,
  AdminSuspendUserInput,
  AdminUpdateRolesInput,
  AdminUserResponse,
} from "@kitchenpal/api-contract";
import type { FilterQuery, HydratedDocument } from "mongoose";
import { ErrorCode } from "../../../common/http/error-codes";
import { PageResult } from "../../../common/http/page-result";
import { TokenService } from "../../auth/services/token.service";
import { AdminUserReadRepository } from "../repositories/admin-read.repository";
import type { User } from "../../auth/schemas/user.schema";
import type { BaseDocumentFields } from "../../../common/database/base.schema";
import { AdminAuditService, buildPage } from "./admin-audit.service";
import { decodeCursor, escapeRegExp } from "./admin-pagination";

type UserEntity = User & BaseDocumentFields;
type UserDoc = HydratedDocument<UserEntity>;

/**
 * Admin management of user accounts across all tenants: list/search/detail,
 * role changes, and suspension. Every mutation is audit-logged. Suspending a
 * user revokes their refresh tokens so the suspension bites within the
 * short access-token TTL rather than the 90-day refresh window.
 */
@Injectable()
export class AdminUsersService {
  constructor(
    private readonly users: AdminUserReadRepository,
    private readonly tokens: TokenService,
    private readonly audit: AdminAuditService,
  ) {}

  async list(query: AdminListQuery): Promise<PageResult<AdminUserResponse>> {
    const skip = decodeCursor(query.cursor);
    const filter: FilterQuery<UserEntity> = {};
    if (query.search) {
      const rx = { $regex: escapeRegExp(query.search), $options: "i" };
      filter.$or = [{ email: rx }, { displayName: rx }, { phone: rx }];
    }
    const { items, total } = await this.users.paginate(
      filter,
      { createdAt: -1 },
      skip,
      query.limit,
    );
    return buildPage(items.map(toAdminUserResponse), skip, total);
  }

  async getById(id: string): Promise<AdminUserResponse> {
    return toAdminUserResponse(await this.requireUser(id));
  }

  async updateRoles(
    actorId: string,
    id: string,
    input: AdminUpdateRolesInput,
  ): Promise<AdminUserResponse> {
    const user = await this.requireUser(id);
    const before = [...user.roles];
    const updated = await this.users.updateWithVersion(
      user.id,
      user.version,
      { roles: input.roles },
      actorId,
    );
    await this.audit.record(actorId, {
      action: "user.roles.update",
      targetType: "user",
      targetId: id,
      before: { roles: before },
      after: { roles: input.roles },
    });
    return toAdminUserResponse(updated);
  }

  async setSuspended(
    actorId: string,
    id: string,
    input: AdminSuspendUserInput,
  ): Promise<AdminUserResponse> {
    const user = await this.requireUser(id);
    const suspendedAt = input.suspended ? new Date() : null;
    const updated = await this.users.updateWithVersion(
      user.id,
      user.version,
      { suspendedAt },
      actorId,
    );
    if (input.suspended) {
      // Kill active sessions so the account cannot refresh back in.
      await this.tokens.revokeAllForUser(user.id);
    }
    await this.audit.record(actorId, {
      action: input.suspended ? "user.suspend" : "user.reinstate",
      targetType: "user",
      targetId: id,
      metadata: input.reason ? { reason: input.reason } : undefined,
    });
    return toAdminUserResponse(updated);
  }

  private async requireUser(id: string): Promise<UserDoc> {
    const user = await this.users.findById(id);
    if (!user) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: "User not found",
        details: { id },
      });
    }
    return user;
  }
}

function toAdminUserResponse(doc: UserDoc): AdminUserResponse {
  return {
    id: doc.id,
    email: doc.email,
    phone: doc.phone,
    displayName: doc.displayName,
    avatarUrl: doc.avatarUrl,
    roles: doc.roles,
    locale: doc.locale,
    emailVerified: doc.emailVerifiedAt !== null,
    phoneVerified: doc.phoneVerifiedAt !== null,
    activeHouseholdId: doc.activeHouseholdId
      ? doc.activeHouseholdId.toString()
      : null,
    suspended: doc.suspendedAt !== null,
    suspendedAt: doc.suspendedAt ? doc.suspendedAt.toISOString() : null,
    version: doc.version,
    createdAt: (doc.createdAt ?? new Date()).toISOString(),
    updatedAt: (doc.updatedAt ?? new Date()).toISOString(),
  };
}
