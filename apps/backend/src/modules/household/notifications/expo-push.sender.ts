import { AppLogger } from "../../../common/logging/app-logger.service";
import type { PushMessage, PushSender } from "./push-sender";

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";
/** Expo caps a single push request at 100 messages. */
const EXPO_BATCH_SIZE = 100;

/**
 * Delivers push notifications through the Expo Push API. Selected when push is
 * enabled in config. An access token is optional (Expo accepts unauthenticated
 * sends) but adds it as a Bearer when present. Delivery failures are LOGGED and
 * swallowed — a push gap must never break the flow that already recorded the
 * in-app notification.
 */
export class ExpoPushSender implements PushSender {
  readonly delivers = true;

  constructor(
    private readonly logger: AppLogger,
    private readonly accessToken?: string,
  ) {}

  async send(messages: PushMessage[]): Promise<void> {
    if (messages.length === 0) {
      return;
    }
    for (let i = 0; i < messages.length; i += EXPO_BATCH_SIZE) {
      const batch = messages.slice(i, i + EXPO_BATCH_SIZE);
      await this.sendBatch(batch);
    }
  }

  private async sendBatch(batch: PushMessage[]): Promise<void> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (this.accessToken) {
      headers.Authorization = `Bearer ${this.accessToken}`;
    }
    const body = batch.map((message) => ({
      to: message.token,
      title: message.title,
      body: message.body,
      data: message.data ?? {},
    }));
    try {
      const response = await fetch(EXPO_PUSH_ENDPOINT, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        this.logger.error(
          `Expo push failed (${response.status}): ${detail}`,
          undefined,
          "ExpoPushSender",
        );
      }
    } catch (error) {
      // Network/transport error: log and move on; never propagate into the caller.
      this.logger.error(
        `Expo push transport error: ${(error as Error).message}`,
        (error as Error).stack,
        "ExpoPushSender",
      );
    }
  }
}
