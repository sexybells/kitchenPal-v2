import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  MessageResponse,
  SendVoteMessageInput,
} from "@kitchenpal/api-contract";
import { chatApi } from "../../api/chat";
import { chatSocket } from "../../api/chat-socket";
import {
  addOptimistic,
  applyRead,
  applyServerMessage,
  fromHistory,
  makeOptimisticText,
  markFailed,
  type ChatMessage,
} from "./message-model";

/** Chat query keys. */
export const chatKeys = {
  messages: (householdId: string) => ["chat", householdId, "messages"] as const,
};

/** Monotonic client id for optimistic messages (no uuid dependency needed). */
let optimisticCounterSeed = 0;
const nextClientId = (): string =>
  `local:${Date.now()}:${(optimisticCounterSeed += 1)}`;

/** How long a received `typing` signal keeps a peer in the typing set. */
const TYPING_TTL_MS = 4000;

export interface ChatChannel {
  messages: ChatMessage[];
  connected: boolean;
  /** True when the socket reported the household join was rejected. */
  rejected: boolean;
  /** Ids of other members currently typing (empty until the gateway rebroadcasts). */
  typingUserIds: string[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  send: (text: string) => void;
  retry: (message: ChatMessage) => void;
  castVote: (messageId: string, optionId: string) => void;
  notifyTyping: () => void;
}

/**
 * Household chat channel: seeds from REST history, then keeps the list live over
 * the socket. Sends are optimistic and reconcile against the server echo; read
 * receipts are applied both locally (for the caller) and from `messagesRead`.
 */
export function useChatChannel(
  householdId: string,
  currentUserId: string,
): ChatChannel {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const [rejected, setRejected] = useState(false);
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);
  const markedRef = useRef<Set<string>>(new Set());

  const history = useQuery({
    queryKey: chatKeys.messages(householdId),
    queryFn: () => chatApi.list(householdId, { limit: 50 }),
  });

  // Seed the live list from history whenever it (re)loads.
  useEffect(() => {
    if (history.data) setMessages(fromHistory(history.data));
  }, [history.data]);

  // Socket lifecycle: connect, join, subscribe, and tear down on unmount.
  useEffect(() => {
    setRejected(false);
    chatSocket.connect();
    chatSocket.joinHousehold(householdId);

    const offStatus = chatSocket.onStatus((status) =>
      setConnected(status === "connected"),
    );
    const offMessage = chatSocket.on("message", (message) =>
      setMessages((list) => applyServerMessage(list, message)),
    );
    const offVote = chatSocket.on("voteUpdated", (message) =>
      setMessages((list) => applyServerMessage(list, message)),
    );
    const offRead = chatSocket.on("messagesRead", (payload) => {
      if (payload.householdId !== householdId) return;
      setMessages((list) =>
        applyRead(list, payload.userId, payload.messageIds),
      );
    });
    const offRejected = chatSocket.on("joinRejected", (payload) => {
      if (payload.householdId === householdId) setRejected(true);
    });
    const offTyping = chatSocket.on("typing", (payload) => {
      if (payload.householdId !== householdId || payload.userId === currentUserId) {
        return;
      }
      setTypingUserIds((ids) =>
        ids.includes(payload.userId) ? ids : [...ids, payload.userId],
      );
      setTimeout(() => {
        setTypingUserIds((ids) => ids.filter((id) => id !== payload.userId));
      }, TYPING_TTL_MS);
    });

    return () => {
      offStatus();
      offMessage();
      offVote();
      offRead();
      offRejected();
      offTyping();
      chatSocket.leaveHousehold();
    };
  }, [householdId, currentUserId]);

  // Mark newly-seen incoming messages read (once each) so senders get receipts.
  useEffect(() => {
    const unread = messages
      .filter(
        (m) =>
          m.senderId !== null &&
          m.senderId !== currentUserId &&
          !m.readByUserIds.includes(currentUserId) &&
          !markedRef.current.has(m.id),
      )
      .map((m) => m.id);
    if (unread.length === 0) return;
    unread.forEach((id) => markedRef.current.add(id));
    setMessages((list) => applyRead(list, currentUserId, unread));
    chatSocket.markRead(householdId, unread);
  }, [messages, householdId, currentUserId]);

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const clientId = nextClientId();
      setMessages((list) =>
        addOptimistic(
          list,
          makeOptimisticText(householdId, currentUserId, trimmed, clientId),
        ),
      );
      chatSocket
        .sendMessage(householdId, trimmed)
        .then((message) =>
          setMessages((list) => applyServerMessage(list, message)),
        )
        .catch(() => setMessages((list) => markFailed(list, clientId)));
    },
    [householdId, currentUserId],
  );

  const retry = useCallback(
    (message: ChatMessage) => {
      if (message.text) {
        setMessages((list) =>
          list.filter((m) => m.clientId !== message.clientId),
        );
        send(message.text);
      }
    },
    [send],
  );

  const castVote = useCallback(
    (messageId: string, optionId: string) => {
      chatSocket
        .castVote(householdId, messageId, optionId)
        .then((message) =>
          setMessages((list) => applyServerMessage(list, message)),
        )
        .catch(() => undefined);
    },
    [householdId],
  );

  const notifyTyping = useCallback(() => {
    chatSocket.emitTyping(householdId);
  }, [householdId]);

  return {
    messages,
    connected,
    rejected,
    typingUserIds,
    isLoading: history.isLoading,
    isError: history.isError,
    refetch: () => void history.refetch(),
    send,
    retry,
    castVote,
    notifyTyping,
  };
}

/** Create a vote poll via REST; the resulting `message` broadcast renders it. */
export const useCreateVote = (householdId: string) =>
  useMutation({
    mutationFn: (input: SendVoteMessageInput): Promise<MessageResponse> =>
      chatApi.sendVote(householdId, input),
  });

/** Attach an already-uploaded image to the chat. */
export const useSendImage = (householdId: string) =>
  useMutation({
    mutationFn: (imageUrl: string): Promise<MessageResponse> =>
      chatApi.sendImage(householdId, { imageUrl }),
  });
