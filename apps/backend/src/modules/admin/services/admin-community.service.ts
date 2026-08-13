import { Injectable, NotFoundException } from "@nestjs/common";
import type {
  AdminCommunityReportQuery,
  AdminCommunityReportResponse,
} from "@kitchenpal/api-contract";
import { Types } from "mongoose";
import { ErrorCode } from "../../../common/http/error-codes";
import { PageResult } from "../../../common/http/page-result";
import { UserRepository } from "../../auth/repositories/user.repository";
import {
  CommunityCommentRepository,
  type CommunityCommentEntity,
} from "../../community/repositories/community-comment.repository";
import {
  CommunityPostRepository,
  type CommunityPostEntity,
} from "../../community/repositories/community-post.repository";
import { CommunityReportRepository } from "../../community/repositories/community-report.repository";
import { AdminAuditService, buildPage } from "./admin-audit.service";
import { decodeCursor } from "./admin-pagination";

/** How much of a reported target's text/caption to show in the queue. */
const PREVIEW_MAX = 140;

/**
 * Admin moderation of the community feed: list reports (with a short target
 * preview) and act on them — remove the offending post/comment (soft-delete) and
 * mark its open reports `reviewed`, or dismiss a report. Reuses the community
 * repositories (exported by CommunityModule); every action is audit-logged.
 */
@Injectable()
export class AdminCommunityService {
  constructor(
    private readonly posts: CommunityPostRepository,
    private readonly comments: CommunityCommentRepository,
    private readonly reports: CommunityReportRepository,
    private readonly users: UserRepository,
    private readonly audit: AdminAuditService,
  ) {}

  async listReports(
    query: AdminCommunityReportQuery,
  ): Promise<PageResult<AdminCommunityReportResponse>> {
    const skip = decodeCursor(query.cursor);
    const { items, total } = await this.reports.listByStatus(
      query.status,
      skip,
      query.limit,
    );

    // Batch the reporter and target lookups so a page costs a fixed handful of
    // queries rather than one per report. Removed targets simply resolve to null.
    const reporters = await this.resolveNames(
      items.map((report) => report.createdBy?.toString()),
    );
    const postIds = items
      .filter((r) => r.targetType === "post")
      .map((r) => r.targetId.toString());
    const commentIds = items
      .filter((r) => r.targetType === "comment")
      .map((r) => r.targetId.toString());
    const [postMap, commentMap] = await Promise.all([
      this.mapPosts(postIds),
      this.mapComments(commentIds),
    ]);

    const rows = items.map((report) => {
      const targetId = report.targetId.toString();
      const post =
        report.targetType === "post" ? postMap.get(targetId) : undefined;
      const comment =
        report.targetType === "comment"
          ? commentMap.get(targetId)
          : undefined;
      const preview = post
        ? truncate(post.caption)
        : comment
          ? truncate(comment.text)
          : null;
      const targetAuthorName =
        post?.authorName ?? comment?.authorName ?? null;
      return {
        id: report.id,
        targetType: report.targetType,
        targetId,
        reason: report.reason,
        detail: report.detail ?? null,
        status: report.status,
        reporterName: reporters.get(report.createdBy?.toString() ?? "") ?? "",
        targetPreview: preview,
        targetAuthorName,
        createdAt: (report.createdAt ?? new Date()).toISOString(),
      } satisfies AdminCommunityReportResponse;
    });

    return buildPage(rows, skip, total);
  }

  async removePost(actorId: string, id: string): Promise<void> {
    const post = await this.posts.findById(id);
    if (!post) {
      throw this.notFound(id, "Post");
    }
    await this.posts.softDelete(id, actorId);
    await this.reports.markOpenReviewed(id);
    await this.audit.record(actorId, {
      action: "community.post.remove",
      targetType: "community_post",
      targetId: id,
    });
  }

  async removeComment(actorId: string, id: string): Promise<void> {
    const comment = await this.comments.findById(id);
    if (!comment) {
      throw this.notFound(id, "Comment");
    }
    await this.comments.softDelete(id, actorId);
    // Keep the parent post's counter correct when moderation removes a comment.
    await this.posts.adjustCommentCount(comment.postId.toString(), -1);
    await this.reports.markOpenReviewed(id);
    await this.audit.record(actorId, {
      action: "community.comment.remove",
      targetType: "community_comment",
      targetId: id,
    });
  }

  async dismissReport(actorId: string, id: string): Promise<void> {
    const report = await this.reports.findById(id);
    if (!report) {
      throw this.notFound(id, "Report");
    }
    await this.reports.updateWithVersion(
      report.id,
      report.version,
      { status: "dismissed" },
      actorId,
    );
    await this.audit.record(actorId, {
      action: "community.report.dismiss",
      targetType: "community_report",
      targetId: id,
    });
  }

  private async resolveNames(
    ids: (string | undefined)[],
  ): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    if (unique.length === 0) {
      return new Map();
    }
    const users = await this.users.find({
      _id: { $in: unique.map((id) => new Types.ObjectId(id)) },
    });
    return new Map(users.map((user) => [user.id, user.displayName]));
  }

  private async mapPosts(
    ids: string[],
  ): Promise<Map<string, CommunityPostEntity>> {
    if (ids.length === 0) {
      return new Map();
    }
    const docs = await this.posts.find({
      _id: { $in: ids.map((id) => new Types.ObjectId(id)) },
    });
    return new Map(docs.map((doc) => [doc.id, doc]));
  }

  private async mapComments(
    ids: string[],
  ): Promise<Map<string, CommunityCommentEntity>> {
    if (ids.length === 0) {
      return new Map();
    }
    const docs = await this.comments.find({
      _id: { $in: ids.map((id) => new Types.ObjectId(id)) },
    });
    return new Map(docs.map((doc) => [doc.id, doc]));
  }

  private notFound(id: string, label: string): NotFoundException {
    return new NotFoundException({
      code: ErrorCode.NOT_FOUND,
      message: `${label} not found`,
      details: { id },
    });
  }
}

/** Trims a target preview to a bounded length for the moderation queue. */
function truncate(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > PREVIEW_MAX
    ? `${trimmed.slice(0, PREVIEW_MAX)}…`
    : trimmed;
}
