import { z } from "zod";
import { objectIdSchema } from "./pantry.js";

/**
 * Message kinds carried by the household chat. `text`/`image` are member-authored;
 * `vote` is a recipe poll; `expense`/`budget_alert` are system cards posted by the
 * spending seam when a member acts in the household. Cards are never client-forged
 * — the server sets the type when it posts them.
 */
export const messageTypeSchema = z.enum([
  "text",
  "image",
  "vote",
  "expense",
  "budget_alert",
]);
export type MessageType = z.infer<typeof messageTypeSchema>;

/** One selectable option on a vote poll. */
export const voteOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
});
export type VoteOption = z.infer<typeof voteOptionSchema>;

/** Live tally for one option: how many voted for it and who. */
export const voteTallySchema = z.object({
  optionId: z.string(),
  count: z.number().int().nonnegative(),
  voterIds: z.array(z.string()),
});
export type VoteTally = z.infer<typeof voteTallySchema>;

/** The vote payload embedded in a `vote` message. */
export const votePayloadSchema = z.object({
  question: z.string(),
  options: z.array(voteOptionSchema),
  tally: z.array(voteTallySchema),
});
export type VotePayload = z.infer<typeof votePayloadSchema>;

/** A chat message as returned over REST and emitted over the socket. */
export const messageResponseSchema = z.object({
  id: z.string(),
  householdId: z.string(),
  senderId: z.string().nullable(),
  type: messageTypeSchema,
  text: z.string().nullable(),
  imageUrl: z.string().nullable(),
  expenseId: z.string().nullable(),
  vote: votePayloadSchema.nullable(),
  /** User ids that have marked this message read (includes the sender). */
  readByUserIds: z.array(z.string()),
  createdAt: z.string(),
});
export type MessageResponse = z.infer<typeof messageResponseSchema>;

/** Post a text message. */
export const sendTextMessageSchema = z.object({
  text: z.string().min(1).max(4000),
});
export type SendTextMessageInput = z.infer<typeof sendTextMessageSchema>;

/** Post a vote poll. Option ids are server-assigned. */
export const sendVoteMessageSchema = z.object({
  question: z.string().min(1).max(500),
  options: z.array(z.string().min(1).max(200)).min(2).max(10),
});
export type SendVoteMessageInput = z.infer<typeof sendVoteMessageSchema>;

/** Cast (or move) the caller's vote on a poll message. */
export const castVoteSchema = z.object({
  optionId: z.string().min(1),
});
export type CastVoteInput = z.infer<typeof castVoteSchema>;

/** Attach an already-uploaded image to the chat. */
export const sendImageMessageSchema = z.object({
  imageUrl: z.string().min(1).max(2000),
});
export type SendImageMessageInput = z.infer<typeof sendImageMessageSchema>;

/** Mark a set of messages read by the caller. */
export const markReadSchema = z.object({
  messageIds: z.array(objectIdSchema).min(1).max(200),
});
export type MarkReadInput = z.infer<typeof markReadSchema>;

/** Cursor-paginated message history query (newest first). */
export const messageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.string().optional(),
});
export type MessageQuery = z.infer<typeof messageQuerySchema>;
