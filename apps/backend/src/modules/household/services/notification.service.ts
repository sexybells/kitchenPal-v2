import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type {
  NotificationQuery,
  NotificationResponse,
  NotificationType,
} from "@kitchenpal/api-contract";
import type { HydratedDocument } from "mongoose";
import { ErrorCode } from "../../../common/http/error-codes";
import { AppLogger } from "../../../common/logging/app-logger.service";
import { PageResult, paginate } from "../../../common/http/page-result";
import type { ScopeContext } from "../../../common/scope/scope-context";
import {
  EMAIL_ADAPTER,
  type EmailAdapter,
} from "../../auth/adapters/email-adapter";
import { UserRepository } from "../../auth/repositories/user.repository";
import { UserSettingsRepository } from "../../users/repositories/user-settings.repository";
import {
  NotificationEntity,
  NotificationRepository,
} from "../repositories/notification.repository";
import { PUSH_SENDER, type PushMessage, type PushSender } from "../notifications/push-sender";
import { RealtimeEmitter } from "../realtime/realtime-emitter";

type NotificationDoc = HydratedDocument<NotificationEntity>;

/** Optional out-of-app delivery content attached to a notification. */
export interface NotificationDelivery {
  push?: { title: string; body: string };
  email?: { subject: string; text: string };
}

/** A notification to create and fan out to one user. */
export interface NotifyInput {
  type: NotificationType;
  payload: Record<string, unknown>;
  delivery?: NotificationDelivery;
}

/**
 * Which extra channels a notification type may use. In-app is always created;
 * push/email additionally fire only when the type allows it, the user opted in,
 * and delivery content was supplied. Chat messages never email (too noisy);
 * mentions, invites, and the alert types do.
 */
const CHANNELS: Record<NotificationType, { push: boolean; email: boolean }> = {
  expiry_alert: { push: true, email: true },
  budget_alert: { push: true, email: true },
  chat_message: { push: true, email: false },
  chat_mention: { push: true, email: true },
  household_invite: { push: true, email: true },
  invite_accepted: { push: true, email: false },
  vegetarian_day: { push: true, email: false },
};

function personalScope(userId: string): ScopeContext {
  return { scope: "personal", userId, householdId: null };
}

/**
 * Owns the notification lifecycle: it always persists an in-app record and emits
 * it live to the recipient's socket room, then fans out to push and email based
 * on the type policy and the user's own channel preferences. Every out-of-app
 * transport is best-effort — a delivery failure is logged, never thrown, so it
 * cannot break the action that triggered the notification.
 */
@Injectable()
export class NotificationService {
  constructor(
    private readonly notifications: NotificationRepository,
    private readonly settings: UserSettingsRepository,
    private readonly users: UserRepository,
    private readonly realtime: RealtimeEmitter,
    private readonly logger: AppLogger,
    @Inject(PUSH_SENDER) private readonly push: PushSender,
    @Inject(EMAIL_ADAPTER) private readonly email: EmailAdapter,
  ) {}

  /** Creates and fans out a notification for a single user. */
  async notify(userId: string, input: NotifyInput): Promise<void> {
    const doc = await this.notifications.create(
      {
        userId,
        type: input.type,
        payload: input.payload,
        readAt: null,
      } as unknown as Partial<NotificationEntity>,
      userId,
    );
    // Live in-app delivery to every device the user has connected.
    this.realtime.emitToUser(userId, "notification", toResponse(doc));
    await this.fanOut(userId, input);
  }

  /** Fans out the same notification to several users (e.g. chat members). */
  async notifyMany(userIds: string[], input: NotifyInput): Promise<void> {
    await Promise.all(userIds.map((userId) => this.notify(userId, input)));
  }

  async list(
    userId: string,
    query: NotificationQuery,
  ): Promise<PageResult<NotificationResponse>> {
    const skip = decodeCursor(query.cursor);
    const { items, total } = await this.notifications.page(
      userId,
      query.unreadOnly,
      skip,
      query.limit,
    );
    const nextSkip = skip + items.length;
    const hasMore = nextSkip < total;
    return paginate(items.map(toResponse), {
      nextCursor: hasMore ? encodeCursor(nextSkip) : null,
      total,
    });
  }

  async markRead(userId: string, id: string): Promise<NotificationResponse> {
    const existing = await this.notifications.findForUser(userId, id);
    if (!existing) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: "Notification not found",
        details: { id },
      });
    }
    // Already-read stays idempotent: return the current state without re-stamping.
    const updated = await this.notifications.markRead(userId, id);
    return toResponse(updated ?? existing);
  }

  /**
   * Best-effort push + email fan-out. Reads the user's channel preferences and
   * contact details; any transport error is logged and swallowed so the in-app
   * record (already persisted) remains the durable source of truth.
   */
  private async fanOut(userId: string, input: NotifyInput): Promise<void> {
    const policy = CHANNELS[input.type];
    const settings = await this.settings.findOne(personalScope(userId));
    const prefs = settings?.notifications;

    if (policy.push && input.delivery?.push && prefs?.push !== false) {
      const tokens = settings?.pushTokens ?? [];
      const messages: PushMessage[] = tokens.map((entry) => ({
        token: entry.token,
        title: input.delivery!.push!.title,
        body: input.delivery!.push!.body,
        data: { type: input.type, ...input.payload },
      }));
      if (messages.length > 0) {
        try {
          await this.push.send(messages);
        } catch (error) {
          this.logger.error(
            `Push fan-out failed for user ${userId}: ${(error as Error).message}`,
            (error as Error).stack,
            "NotificationService",
          );
        }
      }
    }

    if (policy.email && input.delivery?.email && prefs?.email !== false) {
      const user = await this.users.findById(userId);
      if (user?.email) {
        try {
          await this.email.send({
            to: user.email,
            subject: input.delivery.email.subject,
            text: input.delivery.email.text,
          });
        } catch (error) {
          this.logger.error(
            `Email fan-out failed for user ${userId}: ${(error as Error).message}`,
            (error as Error).stack,
            "NotificationService",
          );
        }
      }
    }
  }
}

function toResponse(doc: NotificationDoc): NotificationResponse {
  return {
    id: doc.id,
    type: doc.type,
    payload: doc.payload,
    readAt: doc.readAt ? doc.readAt.toISOString() : null,
    createdAt: (doc.createdAt ?? new Date()).toISOString(),
  };
}

function encodeCursor(offset: number): string {
  return Buffer.from(String(offset), "utf8").toString("base64url");
}

function decodeCursor(cursor: string | undefined): number {
  if (!cursor) {
    return 0;
  }
  const decoded = Number.parseInt(
    Buffer.from(cursor, "base64url").toString("utf8"),
    10,
  );
  return Number.isFinite(decoded) && decoded >= 0 ? decoded : 0;
}
