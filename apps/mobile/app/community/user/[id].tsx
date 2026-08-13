import { ActivityIndicator, FlatList, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import type { CommunityPostResponse } from "@kitchenpal/api-contract";
import {
  Screen,
  ScreenHeader,
  Text,
  Avatar,
  Button,
  Badge,
  LoadingState,
  EmptyState,
  ErrorState,
} from "../../../src/ui";
import { theme } from "../../../src/theme";
import { resolveErrorMessage } from "../../../src/lib/error-message";
import {
  useCommunityFeed,
  useUserProfile,
  useBlockUser,
} from "../../../src/features/community/hooks";
import { PostCard } from "../../../src/features/community/PostCard";

/** Basic public profile: identity + post count, block toggle, and that user's posts. */
export default function UserProfileScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = id ?? null;

  const profile = useUserProfile(userId);
  const feed = useCommunityFeed(userId ?? undefined);
  const block = useBlockUser();

  const posts = feed.data?.pages.flatMap((page) => page.items) ?? [];

  const renderItem = ({ item }: { item: CommunityPostResponse }) => (
    <PostCard
      post={item}
      onOpenProfile={(authorId) => router.push(`/community/user/${authorId}`)}
      onOpenRecipe={(recipeId) => router.push(`/recipe?id=${recipeId}`)}
      onOpenComments={(postId) => router.push(`/community/${postId}`)}
      testID={`profile-post-${item.id}`}
    />
  );

  if (profile.isLoading) {
    return (
      <Screen testID="user-profile-screen">
        <ScreenHeader title={t("community.profileTitle")} onBack={() => router.back()} />
        <LoadingState label={t("common.loading")} />
      </Screen>
    );
  }
  if (profile.isError || !profile.data || !userId) {
    return (
      <Screen testID="user-profile-screen">
        <ScreenHeader title={t("community.profileTitle")} onBack={() => router.back()} />
        <ErrorState
          title={t("states.errorTitle")}
          body={resolveErrorMessage(profile.error, t) ?? t("states.errorBody")}
          retryLabel={t("common.retry")}
          onRetry={() => profile.refetch()}
          testID="user-profile-error"
        />
      </Screen>
    );
  }

  const user = profile.data;

  const header = (
    <View style={styles.header}>
      <Avatar name={user.displayName} uri={user.avatarUrl} size={72} />
      <Text variant="heading-m" color="text" center>
        {user.displayName}
      </Text>
      <Text variant="body-m" color="text-muted">
        {t("community.postsCount", { count: user.postCount })}
      </Text>
      {user.blockedByMe ? (
        <Badge label={t("community.blocked")} tone="danger" />
      ) : null}
      {!user.isSelf ? (
        <Button
          label={user.blockedByMe ? t("community.unblock") : t("community.block")}
          variant="secondary"
          onPress={() =>
            block.mutate({ userId, block: !user.blockedByMe })
          }
          loading={block.isPending}
          testID="user-profile-block"
        />
      ) : null}
    </View>
  );

  return (
    <Screen scroll={false} testID="user-profile-screen">
      <ScreenHeader title={t("community.profileTitle")} onBack={() => router.back()} />

      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={header}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshing={feed.isRefetching && !feed.isFetchingNextPage}
        onRefresh={() => feed.refetch()}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (feed.hasNextPage && !feed.isFetchingNextPage) feed.fetchNextPage();
        }}
        ListEmptyComponent={
          feed.isLoading ? (
            <LoadingState label={t("common.loading")} />
          ) : (
            <EmptyState
              title={t("community.profileEmptyTitle")}
              body={t("community.profileEmptyBody")}
              icon="community"
              testID="user-profile-empty"
            />
          )
        }
        ListFooterComponent={
          feed.isFetchingNextPage ? (
            <ActivityIndicator
              style={styles.footer}
              color={theme.colors.primary}
            />
          ) : null
        }
        testID="user-profile-list"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: "center",
    gap: theme.spacing[8],
    paddingVertical: theme.spacing[20],
  },
  list: { gap: theme.spacing[16], paddingBottom: theme.spacing[32], flexGrow: 1 },
  footer: { paddingVertical: theme.spacing[16] },
});
