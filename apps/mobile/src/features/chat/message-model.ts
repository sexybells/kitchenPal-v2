import type { MessageResponse } from "@kitchenpal/api-contract";

/** Delivery state of a locally-composed message not yet confirmed by the server. */
export type MessageStatus = "pending" | "failed";

/**
 * A chat message as held in the list. Server messages carry no `clientId`/`status`;
 * an optimistic (locally-composed) message carries both until the server confirms
 * it, at which point it is replaced by the authoritative server message.
 */
export interface ChatMessage extends MessageResponse {
  /** Set on optimistic messages to reconcile them against the server echo. */
  clientId?: string;
  status?: MessageStatus;
}

/** Build an optimistic text message to render immediately on send. */
export const makeOptimisticText = (
  householdId: string,
  senderId: string,
  text: string,
  clientId: string,
): ChatMessage => ({
  id: clientId,
  householdId,
  senderId,
  type: "text",
  text,
  imageUrl: null,
  expenseId: null,
  vote: null,
  readByUserIds: [senderId],
  createdAt: new Date().toISOString(),
  clientId,
  status: "pending",
});

/** Chronological (oldest → newest) ordering used by the message list. */
const byCreatedAt = (a: ChatMessage, b: ChatMessage): number =>
  a.createdAt.localeCompare(b.createdAt);

/** Normalise REST history (newest-first) into the chronological list order. */
export const fromHistory = (messages: MessageResponse[]): ChatMessage[] =>
  [...messages].sort(byCreatedAt);

/** Append an optimistic message to the end of the list. */
export const addOptimistic = (
  list: ChatMessage[],
  message: ChatMessage,
): ChatMessage[] => [...list, message];

/**
 * Merge a server message (from an ack or a `message`/`voteUpdated` broadcast).
 *  - If the id already exists, replace it in place (idempotent re-delivery).
 *  - Else, if a still-pending optimistic message matches the sender + text,
 *    reconcile it (swap the temp for the confirmed server message).
 *  - Otherwise insert it in chronological order.
 */
export const applyServerMessage = (
  list: ChatMessage[],
  incoming: MessageResponse,
): ChatMessage[] => {
  const existingIndex = list.findIndex((m) => m.id === incoming.id);
  if (existingIndex >= 0) {
    const next = [...list];
    next[existingIndex] = { ...incoming };
    return next;
  }

  const pendingIndex = list.findIndex(
    (m) =>
      m.status === "pending" &&
      m.type === incoming.type &&
      m.senderId === incoming.senderId &&
      m.text === incoming.text,
  );
  if (pendingIndex >= 0) {
    const next = [...list];
    next[pendingIndex] = { ...incoming };
    return next;
  }

  return [...list, { ...incoming }].sort(byCreatedAt);
};

/** Flag an optimistic message as failed so the UI can offer a retry. */
export const markFailed = (
  list: ChatMessage[],
  clientId: string,
): ChatMessage[] =>
  list.map((m) =>
    m.clientId === clientId ? { ...m, status: "failed" as const } : m,
  );

/** Apply a read receipt: add the reader to `readByUserIds` for the given ids. */
export const applyRead = (
  list: ChatMessage[],
  userId: string,
  messageIds: string[],
): ChatMessage[] => {
  const ids = new Set(messageIds);
  return list.map((m) => {
    if (!ids.has(m.id) || m.readByUserIds.includes(userId)) return m;
    return { ...m, readByUserIds: [...m.readByUserIds, userId] };
  });
};

/**
 * Read state of an outgoing message: seen once at least one other member (not the
 * sender) is in `readByUserIds`.
 */
export const isSeenByOthers = (
  message: ChatMessage,
  senderId: string,
): boolean => message.readByUserIds.some((id) => id !== senderId);
