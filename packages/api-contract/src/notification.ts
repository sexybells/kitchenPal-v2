import { z } from "zod";

/**
 * Notification kinds. Stable machine codes the client localizes and routes on
 * (deep links). Covers the key fanout events: pantry expiry, budget alerts, chat
 * activity, and household invites.
 */
export const notificationTypeSchema = z.enum([
  "expiry_alert",
  "budget_alert",
  "chat_message",
  "chat_mention",
  "household_invite",
  "invite_accepted",
]);
export type NotificationType = z.infer<typeof notificationTypeSchema>;

/**
 * A user notification. `payload` carries type-specific context (ids, counts,
 * preview text) the client uses to render and deep-link; it is a free-form object
 * so new event types need no schema change.
 */
export const notificationResponseSchema = z.object({
  id: z.string(),
  type: notificationTypeSchema,
  payload: z.record(z.string(), z.unknown()),
  /** ISO time the user read it, or null when unread. */
  readAt: z.string().nullable(),
  createdAt: z.string(),
});
export type NotificationResponse = z.infer<typeof notificationResponseSchema>;

/** Cursor-paginated notification list, optionally unread-only. */
export const notificationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.string().optional(),
  unreadOnly: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});
export type NotificationQuery = z.infer<typeof notificationQuerySchema>;
