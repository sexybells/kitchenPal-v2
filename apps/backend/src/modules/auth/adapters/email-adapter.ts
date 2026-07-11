/** A transactional email to deliver. */
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

/**
 * Pluggable transactional-email transport. The Resend adapter sends for real;
 * the development adapter logs instead. `delivers` tells callers whether a real
 * message went out, so dev flows can safely surface the token to the client.
 */
export interface EmailAdapter {
  readonly delivers: boolean;
  send(message: EmailMessage): Promise<void>;
}

/** DI token for the selected {@link EmailAdapter}. */
export const EMAIL_ADAPTER = "EMAIL_ADAPTER";
