import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { CommunityCommentResponse } from "@kitchenpal/api-contract";
import { Card, Text, Icon, Avatar, EmptyState } from "../../ui";
import { theme } from "../../theme";
import { useDeleteComment, useReport } from "./hooks";
import { ActionSheet, type SheetAction } from "./ActionSheet";
import { ReportSheet } from "./ReportSheet";
import { postTime } from "./labels";

export interface CommentListProps {
  postId: string;
  comments: CommunityCommentResponse[];
  onOpenProfile: (authorId: string) => void;
  testID?: string;
}

/** Flat list of comments with a per-row "…" menu (report / delete-own). */
export function CommentList({
  postId,
  comments,
  onOpenProfile,
  testID,
}: CommentListProps) {
  const { t } = useTranslation();

  if (comments.length === 0) {
    return (
      <EmptyState
        title={t("community.commentsEmpty")}
        icon="users"
        testID={testID ? `${testID}-empty` : undefined}
      />
    );
  }

  return (
    <View style={styles.list} testID={testID}>
      {comments.map((comment) => (
        <CommentRow
          key={comment.id}
          postId={postId}
          comment={comment}
          onOpenProfile={onOpenProfile}
        />
      ))}
    </View>
  );
}

function CommentRow({
  postId,
  comment,
  onOpenProfile,
}: {
  postId: string;
  comment: CommunityCommentResponse;
  onOpenProfile: (authorId: string) => void;
}) {
  const { t } = useTranslation();
  const deleteComment = useDeleteComment();
  const report = useReport();
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const actions: SheetAction[] = comment.isOwner
    ? [
        {
          key: "delete",
          label: t("community.deleteComment"),
          icon: "close",
          tone: "danger",
          onPress: () => {
            setMenuOpen(false);
            deleteComment.mutate({ commentId: comment.id, postId });
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
      ];

  return (
    <Card elevated={false} background="surface-alt" testID={`comment-${comment.id}`}>
      <View style={styles.head}>
        <Pressable
          style={styles.author}
          onPress={() => onOpenProfile(comment.authorId)}
          accessibilityRole="button"
          accessibilityLabel={t("community.viewProfile")}
        >
          <Avatar name={comment.authorName} uri={comment.authorAvatarUrl} size={28} />
          <Text variant="label-m" color="text">
            {comment.authorName}
          </Text>
          <Text variant="caption" color="text-muted">
            {postTime(comment.createdAt)}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setMenuOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={t("community.more")}
          hitSlop={8}
          testID={`comment-${comment.id}-menu`}
        >
          <Icon name="more" size={18} color="text-muted" />
        </Pressable>
      </View>
      <Text variant="body-m" color="text" style={styles.text}>
        {comment.text}
      </Text>

      <ActionSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        actions={actions}
      />
      <ReportSheet
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        onSelect={(reason) => {
          setReportOpen(false);
          report.mutate({
            targetType: "comment",
            id: comment.id,
            input: { reason },
          });
        }}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  list: { gap: theme.spacing[8] },
  head: {
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
  text: { marginTop: theme.spacing[4] },
});
