import { useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { launchImageLibraryAsync } from "expo-image-picker";
import {
  Button,
  Icon,
  LoadingState,
  ErrorState,
  Screen,
  Text,
} from "../src/ui";
import { theme } from "../src/theme";
import { useSessionStore } from "../src/store/session";
import { useMembers } from "../src/features/household/hooks";
import { useChatChannel, useCreateVote, useSendImage } from "../src/features/chat/hooks";
import { MessageBubble } from "../src/features/chat/MessageBubble";
import { VoteCard } from "../src/features/chat/VoteCard";
import { SystemCard } from "../src/features/chat/SystemCard";
import { ChatInputBar } from "../src/features/chat/ChatInputBar";
import { PollComposer } from "../src/features/chat/PollComposer";
import { TypingIndicator } from "../src/features/chat/TypingIndicator";
import type { ChatMessage } from "../src/features/chat/message-model";

/**
 * Household chat: a realtime, membership-scoped message list carrying text/image
 * bubbles, recipe vote polls, and system expense/budget cards, with an optimistic
 * composer. History seeds over REST; the socket keeps it live.
 */
export default function ChatScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ householdId?: string }>();
  const householdId = typeof params.householdId === "string" ? params.householdId : "";
  const currentUserId = useSessionStore((state) => state.user?.id) ?? "";

  const [pollOpen, setPollOpen] = useState(false);
  const channel = useChatChannel(householdId, currentUserId);
  const createVote = useCreateVote(householdId);
  const sendImage = useSendImage(householdId);
  const members = useMembers(householdId || undefined);

  // Map a sender id to their display name for incoming bubbles.
  const nameFor = (senderId: string | null): string | undefined =>
    members.data?.find((member) => member.userId === senderId)?.displayName;

  const attachImage = async () => {
    const result = await launchImageLibraryAsync({ quality: 0.7 });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    // The server accepts an already-hosted image URL; native file URIs are sent
    // as-is here (the storage-upload step is wired where the adapter is available).
    sendImage.mutate(asset.uri);
  };

  const renderItem = ({ item }: { item: ChatMessage }) => {
    if (item.type === "vote") {
      return (
        <VoteCard
          message={item}
          currentUserId={currentUserId}
          onVote={(optionId) => channel.castVote(item.id, optionId)}
          testID={`message-${item.id}`}
        />
      );
    }
    if (item.type === "expense" || item.type === "budget_alert") {
      return <SystemCard message={item} testID={`message-${item.id}`} />;
    }
    const isOwn = item.senderId === currentUserId;
    return (
      <MessageBubble
        message={item}
        isOwn={isOwn}
        senderName={isOwn ? undefined : nameFor(item.senderId)}
        testID={`message-${item.id}`}
      />
    );
  };

  if (!householdId) {
    return (
      <Screen testID="chat-screen">
        <ChatHeader onBack={() => router.back()} connected={false} />
        <ErrorState title={t("states.errorTitle")} body={t("states.errorBody")} />
      </Screen>
    );
  }

  return (
    <Screen
      testID="chat-screen"
      scroll={false}
      footer={
        <ChatInputBar
          onSend={channel.send}
          onAttachImage={() => void attachImage()}
          onCreatePoll={() => setPollOpen(true)}
          onTyping={channel.notifyTyping}
          testID="chat-input"
        />
      }
    >
      <ChatHeader onBack={() => router.back()} connected={channel.connected} />

      {channel.isLoading ? (
        <LoadingState label={t("common.loading")} />
      ) : channel.rejected ? (
        <ErrorState
          title={t("chat.rejectedTitle")}
          body={t("chat.rejectedBody")}
          testID="chat-rejected"
        />
      ) : channel.isError ? (
        <ErrorState
          title={t("states.errorTitle")}
          body={t("states.errorBody")}
          retryLabel={t("common.retry")}
          onRetry={channel.refetch}
          testID="chat-error"
        />
      ) : channel.messages.length === 0 ? (
        <View style={styles.empty}>
          <Text variant="body-m" color="text-muted" center>
            {t("chat.empty")}
          </Text>
        </View>
      ) : (
        <FlatList
          data={channel.messages}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          testID="chat-list"
        />
      )}

      <TypingIndicator userIds={channel.typingUserIds} />

      <PollComposer
        visible={pollOpen}
        submitting={createVote.isPending}
        onClose={() => setPollOpen(false)}
        onCreate={(question, options) =>
          createVote.mutate(
            { question, options },
            { onSuccess: () => setPollOpen(false) },
          )
        }
      />
    </Screen>
  );
}

function ChatHeader({
  onBack,
  connected,
}: {
  onBack: () => void;
  connected: boolean;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.header}>
      <Button
        label={t("common.back")}
        variant="ghost"
        icon="chevron-left"
        fullWidth={false}
        onPress={onBack}
      />
      <View style={styles.headerTitle}>
        <Text variant="heading-s" color="text">
          {t("chat.title")}
        </Text>
        <View style={styles.statusRow}>
          <Icon
            name={connected ? "check" : "clock"}
            size={14}
            color={connected ? "success" : "text-subtle"}
          />
          <Text variant="caption" color={connected ? "success" : "text-subtle"}>
            {connected ? t("chat.connected") : t("chat.connecting")}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[8],
    paddingTop: theme.spacing[8],
    marginBottom: theme.spacing[8],
  },
  headerTitle: { flex: 1, gap: theme.spacing[4] },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[4],
  },
  list: { paddingVertical: theme.spacing[8], gap: theme.spacing[4] },
  empty: { flex: 1, alignItems: "center", justifyContent: "center" },
});
