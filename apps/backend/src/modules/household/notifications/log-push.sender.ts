import { AppLogger } from "../../../common/logging/app-logger.service";
import type { PushMessage, PushSender } from "./push-sender";

/**
 * Development push transport: logs what would be sent instead of delivering. Used
 * whenever push is not configured. Unlike email — where a missing production
 * transport fails closed — push is best-effort, so this logs a warning in
 * production rather than throwing: a delivery gap must never break the flow that
 * already persisted the in-app notification.
 */
export class LogPushSender implements PushSender {
  readonly delivers = false;

  constructor(
    private readonly isProduction: boolean,
    private readonly logger: AppLogger,
  ) {}

  send(messages: PushMessage[]): Promise<void> {
    if (messages.length === 0) {
      return Promise.resolve();
    }
    const summary = messages
      .map((message) => `${message.token.slice(0, 12)}…: ${message.title}`)
      .join(", ");
    if (this.isProduction) {
      this.logger.warn(
        `Push is not configured; ${messages.length} notification(s) not delivered: ${summary}`,
        "LogPushSender",
      );
    } else {
      this.logger.debug(
        `Push (dev, not delivered) → ${summary}`,
        "LogPushSender",
      );
    }
    return Promise.resolve();
  }
}
