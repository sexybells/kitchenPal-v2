import { Controller, Get, Param, Patch, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  notificationQuerySchema,
  objectIdSchema,
  type NotificationQuery,
  type NotificationResponse,
} from "@kitchenpal/api-contract";
import type { PageResult } from "../../common/http/page-result";
import type { AuthUser } from "../../common/scope/auth-user";
import { CurrentUser } from "../../common/scope/current-user.decorator";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { NotificationService } from "./services/notification.service";

/**
 * The caller's in-app notifications. Every row is addressed to the authenticated
 * user (identity from the JWT), so a caller only ever sees or mutates their own.
 */
@ApiTags("notifications")
@ApiBearerAuth()
@Controller("notifications")
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  @ApiOperation({ summary: "List the caller's notifications (newest first)" })
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(notificationQuerySchema))
    query: NotificationQuery,
  ): Promise<PageResult<NotificationResponse>> {
    return this.notifications.list(user.id, query);
  }

  @Patch(":id/read")
  @ApiOperation({ summary: "Mark a notification read" })
  markRead(
    @CurrentUser() user: AuthUser,
    @Param("id", new ZodValidationPipe(objectIdSchema)) id: string,
  ): Promise<NotificationResponse> {
    return this.notifications.markRead(user.id, id);
  }
}
