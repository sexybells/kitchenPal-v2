/** A single push message targeted at one device token. */
export interface PushMessage {
  /** Expo/FCM device token. */
  token: string;
  title: string;
  body: string;
  /** Deep-link / routing data delivered alongside the notification. */
  data?: Record<string, unknown>;
}

/**
 * Pluggable push transport (Expo/FCM). The Expo adapter delivers for real; the
 * development adapter logs instead. `delivers` tells callers whether a real push
 * went out, mirroring the email-adapter contract. Providers degrade honestly:
 * a missing/failed transport never throws into the caller's flow — the in-app
 * notification record is always created regardless.
 */
export interface PushSender {
  readonly delivers: boolean;
  send(messages: PushMessage[]): Promise<void>;
}

/** DI token for the selected {@link PushSender}. */
export const PUSH_SENDER = "PUSH_SENDER";
