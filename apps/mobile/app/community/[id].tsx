import { StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  Screen,
  ScreenHeader,
  Text,
  LoadingState,
  ErrorState,
} from "../../src/ui";
import { theme } from "../../src/theme";
import { resolveErrorMessage } from "../../src/lib/error-message";
import {
  usePost,
  usePostComments,
  useAddComment,
} from "../../src/features/community/hooks";
import { PostCard } from "../../src/features/community/PostCard";
import { CommentList } from "../../src/features/community/CommentList";
import { CommentInput } from "../../src/features/community/CommentInput";

/** Post detail: the full post card plus its flat comment thread and composer. */
export default function PostDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const postId = id ?? null;

  const post = usePost(postId);
  const comments = usePostComments(postId);
  const addComment = useAddComment();

  const openProfile = (authorId: string) =>
    router.push(`/community/user/${authorId}`);

  if (post.isLoading) {
    return (
      <Screen testID="post-detail-screen">
        <ScreenHeader title={t("community.postTitle")} onBack={() => router.back()} />
        <LoadingState label={t("common.loading")} />
      </Screen>
    );
  }
  if (post.isError || !post.data || !postId) {
    return (
      <Screen testID="post-detail-screen">
        <ScreenHeader title={t("community.postTitle")} onBack={() => router.back()} />
        <ErrorState
          title={t("states.errorTitle")}
          body={resolveErrorMessage(post.error, t) ?? t("states.errorBody")}
          retryLabel={t("common.retry")}
          onRetry={() => post.refetch()}
          testID="post-detail-error"
        />
      </Screen>
    );
  }

  return (
    <Screen testID="post-detail-screen">
      <ScreenHeader title={t("community.postTitle")} onBack={() => router.back()} />

      <PostCard
        post={post.data}
        onOpenProfile={openProfile}
        onOpenRecipe={(recipeId) => router.push(`/recipe?id=${recipeId}`)}
        onDeleted={() => router.back()}
        testID="post-detail-card"
      />

      <View style={styles.comments}>
        <Text variant="heading-s" color="text">
          {t("community.commentsTitle")}
        </Text>
        <CommentInput
          onSubmit={(text) => addComment.mutate({ id: postId, input: { text } })}
          pending={addComment.isPending}
          testID="post-comment-input"
        />
        {addComment.error ? (
          <Text variant="body-m" color="danger">
            {resolveErrorMessage(addComment.error, t)}
          </Text>
        ) : null}
        {comments.isLoading ? (
          <LoadingState label={t("common.loading")} />
        ) : (
          <CommentList
            postId={postId}
            comments={comments.data ?? []}
            onOpenProfile={openProfile}
            testID="post-comment-list"
          />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  comments: { gap: theme.spacing[12], marginTop: theme.spacing[20] },
});
