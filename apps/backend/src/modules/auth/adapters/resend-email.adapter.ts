import { AppLogger } from "../../../common/logging/app-logger.service";
import type { EmailAdapter, EmailMessage } from "./email-adapter";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/**
 * Sends transactional email through the Resend HTTP API. Used whenever a
 * RESEND_API_KEY is configured. Delivery failures are logged and surfaced so a
 * flow can decide whether the failure is fatal.
 */
export class ResendEmailAdapter implements EmailAdapter {
  readonly delivers = true;

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly logger: AppLogger,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      this.logger.error(
        `Resend delivery failed (${response.status}): ${detail}`,
        undefined,
        "ResendEmailAdapter",
      );
      throw new Error(`Email delivery failed with status ${response.status}`);
    }
  }
}
