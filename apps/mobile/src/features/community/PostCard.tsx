import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { CommunityPostResponse } from "@kitchenpal/api-contract";
import { Card, Text, Icon, Avatar, Chip } from "../../ui";
import { theme } from "../../theme";
import {
  useBlockUser,
  useDeletePost,
  useReport,
  useToggleLike,
} from "./hooks";
import { LikeButton } from "./LikeButton";
import { PostImageCarousel } from "./PostImageCarousel";
import { ActionSheet, type SheetAction } from "./ActionSheet";
import { ReportSheet } from "./ReportSheet";
import { postTime } from "./labels";

export interface PostCardProps {
  post: CommunityPostResponse;
  onOpenProfile: (authorId: string) => void;
  onOpenRecipe: (recipeId: string) => void;
  /** Route to the post's comments; omit on the detail screen (already there). */
  onOpenComments?: (postId: string) => void;
  /** Called after the caller deletes their own post (e.g. to pop the screen). */
  onDeleted?: () => void;
  testID?: string;
}

/**
 * Feed/detail card for a single post: author row (→ profile), image carousel,
 * caption, attached-recipe chip, like toggle, comment count, and a "…" menu
 * (report / block / delete-own). Moderation + like actions are wired to the
 * community hooks so both the feed and detail screens reuse them.
 */
export function PostCard({
  post,
  onOpenProfile,
  onOpenRecipe,
  onOpenComments,
  onDeleted,
  testID,
}: PostCardProps) {
  const { t } = useTranslation();
  const toggleLike = useToggleLike();
  const report = useReport();
  const block = useBlockUser();
  const deletePost = useDeletePost();
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const menuActions: SheetAction[] = post.isOwner
    ? [
        {
          key: "delete",
          label: t("community.deletePost"),
          icon: "close",
          tone: "danger",
          onPress: () => {
            setMenuOpen(false);
            deletePost.mutate(post.id, { onSuccess: () => onDeleted?.() });
          },
        },
      ]
    : [
        {
          key: "report",
          label: t("community.report"),
          icon: "alert",
          onPress: () => {
            setMenuOpen(false);
            setReportOpen(true);
          },
        },
        {
          key: "block",
          label: t("community.block"),
          icon: "user",
          tone: "danger",
          onPress: () => {
            setMenuOpen(false);
            block.mutate({ userId: post.authorId, block: true });
          },
        },
      ];

  return (
    <Card testID={testID} style={styles.card}>
      <View style={styles.header}>
        <Pressable
          style={styles.author}
          onPress={() => onOpenProfile(post.authorId)}
          accessibilityRole="button"
          accessibilityLabel={t("community.viewProfile")}
          testID={testID ? `${testID}-author` : undefined}
        >
          <Avatar name={post.authorName} uri={post.authorAvatarUrl} size={40} />
          <View>
            <Text variant="label-m" color="text">
              {post.authorName}
            </Text>
            <Text variant="caption" color="text-muted">
              {postTime(post.createdAt)}
            </Text>
          </View>
        </Pressable>
        <Pressable
          onPress={() => setMenuOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={t("community.more")}
          hitSlop={8}
          testID={testID ? `${testID}-menu` : undefined}
        >
          <Icon name="more" size={20} color="text-muted" />
        </Pressable>
      </View>

      {post.caption ? (
        <Text variant="body-l" color="text" style={styles.caption}>
          {post.caption}
        </Text>
      ) : null}

      <PostImageCarousel images={post.images} />

      {post.recipeId && post.recipeTitle ? (
        <View style={styles.recipe}>
          <Chip
            label={post.recipeTitle}
            icon="meals"
            onPress={() => onOpenRecipe(post.recipeId as string)}
            testID={testID ? `${testID}-recipe` : undefined}
          />
        </View>
      ) : null}

      <View style={styles.footer}>
        <LikeButton
          liked={post.likedByMe}
          count={post.likeCount}
          onPress={() =>
            toggleLike.mutate({ id: post.id, like: !post.likedByMe })
          }
          testID={testID ? `${testID}-like` : undefined}
        />
        <Pressable
          style={styles.comments}
          onPress={() => onOpenComments?.(post.id)}
          accessibilityRole="button"
          accessibilityLabel={t("community.comment")}
          disabled={!onOpenComments}
          hitSlop={8}
          testID={testID ? `${testID}-comments` : undefined}
        >
          <Icon name="users" size={20} color="text-muted" />
          <Text variant="label-s" color="text-muted">
            {t("community.commentCount", { count: post.commentCount })}
          </Text>
        </Pressable>
      </View>

      <ActionSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        actions={menuActions}
      />
      <ReportSheet
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        onSelect={(reason) => {
          setReportOpen(false);
          report.mutate({ targetType: "post", id: post.id, input: { reason } });
        }}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: theme.spacing[12] },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  author: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[8],
    flex: 1,
  },
  caption: {},
  recipe: { flexDirection: "row" },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[20],
  },
  comments: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[4],
  },
});
