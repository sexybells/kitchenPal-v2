import { z } from "zod";
import {
  messageResponseSchema,
  type MessageQuery,
  type MessageResponse,
  type SendImageMessageInput,
  type SendTextMessageInput,
  type SendVoteMessageInput,
} from "@kitchenpal/api-contract";
import { api } from "./api";

/** The list endpoint returns `data: Message[]` inside the paginated envelope. */
const messageListSchema = z.array(messageResponseSchema);

/** Serialise the cursor-paginated message query, skipping empty values. */
const toMessageQuery = (query: Partial<MessageQuery>): string => {
  const params = new URLSearchParams();
  if (query.limit) params.set("limit", String(query.limit));
  if (query.cursor) params.set("cursor", query.cursor);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
};

/**
 * Household chat REST wrappers. The socket gateway is the realtime path (see
 * `api/socket.ts`); these back the initial history load and the fallbacks used
 * when the socket is not connected. Every route enforces active membership on
 * the `:householdId` server-side.
 */
export const chatApi = {
  /** Message history, newest-first. */
  list: (
    householdId: string,
    query: Partial<MessageQuery> = {},
  ): Promise<MessageResponse[]> =>
    api.request(`households/${householdId}/messages${toMessageQuery(query)}`, {
      method: "GET",
      auth: true,
      schema: messageListSchema,
    }),

  sendText: (
    householdId: string,
    input: SendTextMessageInput,
  ): Promise<MessageResponse> =>
    api.request(`households/${householdId}/messages`, {
      body: input,
      auth: true,
      schema: messageResponseSchema,
    }),

  sendVote: (
    householdId: string,
    input: SendVoteMessageInput,
  ): Promise<MessageResponse> =>
    api.request(`households/${householdId}/messages/vote`, {
      body: input,
      auth: true,
      schema: messageResponseSchema,
    }),

  sendImage: (
    householdId: string,
    input: SendImageMessageInput,
  ): Promise<MessageResponse> =>
    api.request(`households/${householdId}/messages/image`, {
      body: input,
      auth: true,
      schema: messageResponseSchema,
    }),

  markRead: (householdId: string, messageIds: string[]): Promise<void> =>
    api
      .request(`households/${householdId}/messages/read`, {
        body: { messageIds },
        auth: true,
      })
      .then(() => undefined),
};
