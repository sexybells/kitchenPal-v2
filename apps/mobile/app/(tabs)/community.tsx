import { useCallback } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import type { CommunityPostResponse } from "@kitchenpal/api-contract";
import {
  Screen,
  ScreenHeader,
  Icon,
  LoadingState,
  EmptyState,
  ErrorState,
} from "../../src/ui";
import { theme } from "../../src/theme";
import { resolveErrorMessage } from "../../src/lib/error-message";
import { useCommunityFeed } from "../../src/features/community/hooks";
import { PostCard } from "../../src/features/community/PostCard";

/**
 * Community tab: an infinite feed of posts with pull-to-refresh and a composer
 * entry in the header. Loading/empty/error states render via the shared
 * `StateViews`; further pages load on scroll-end.
 */
export default function CommunityScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const feed = useCommunityFeed();

  const posts = feed.data?.pages.flatMap((page) => page.items) ?? [];

  const renderItem = useCallback(
    ({ item }: { item: CommunityPostResponse }) => (
      <PostCard
        post={item}
        onOpenProfile={(authorId) => router.push(`/community/user/${authorId}`)}
        onOpenRecipe={(recipeId) => router.push(`/recipe?id=${recipeId}`)}
        onOpenComments={(id) => router.push(`/community/${id}`)}
        testID={`post-card-${item.id}`}
      />
    ),
    [router],
  );

  return (
    <Screen scroll={false} testID="community-screen">
      <ScreenHeader
        title={t("community.title")}
        right={
          <Pressable
            onPress={() => router.push("/community/new")}
            accessibilityRole="button"
            accessibilityLabel={t("community.newPost")}
            hitSlop={8}
            testID="community-new"
          >
            <Icon name="plus" size={24} color="primary" />
          </Pressable>
        }
      />

      {feed.isLoading ? (
        <LoadingState label={t("common.loading")} />
      ) : feed.isError ? (
        <ErrorState
          title={t("states.errorTitle")}
          body={resolveErrorMessage(feed.error, t) ?? t("states.errorBody")}
          retryLabel={t("common.retry")}
          onRetry={() => feed.refetch()}
          testID="community-error"
        />
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshing={feed.isRefetching && !feed.isFetchingNextPage}
          onRefresh={() => feed.refetch()}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (feed.hasNextPage && !feed.isFetchingNextPage) feed.fetchNextPage();
          }}
          ListEmptyComponent={
            <EmptyState
              title={t("community.feedEmptyTitle")}
              body={t("community.feedEmptyBody")}
              icon="community"
              testID="community-empty"
            />
          }
          ListFooterComponent={
            feed.isFetchingNextPage ? (
              <ActivityIndicator
                style={styles.footer}
                color={theme.colors.primary}
              />
            ) : null
          }
          testID="community-list"
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: theme.spacing[16], paddingBottom: theme.spacing[32], flexGrow: 1 },
  footer: { paddingVertical: theme.spacing[16] },
});
