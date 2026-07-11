import { AppLogger } from "../../../common/logging/app-logger.service";
import type { EmailAdapter, EmailMessage } from "./email-adapter";

/**
 * Development email transport: logs the message instead of sending it, so local
 * flows can read verification/reset tokens without a real provider.
 *
 * Fail-closed: constructing this adapter in production is a misconfiguration
 * (no real transport), so `send` refuses to run there. Selection logic must
 * never wire this adapter in production.
 */
export class LogEmailAdapter implements EmailAdapter {
  readonly delivers = false;

  constructor(
    private readonly isProduction: boolean,
    private readonly logger: AppLogger,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    if (this.isProduction) {
      throw new Error(
        "Email is not configured. Set RESEND_API_KEY; the development log transport is disabled in production.",
      );
    }
    this.logger.warn(
      `[dev email] to=${message.to} subject="${message.subject}" body="${message.text}"`,
      "LogEmailAdapter",
    );
    return Promise.resolve();
  }
}
