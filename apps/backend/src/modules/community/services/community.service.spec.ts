import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { Types } from "mongoose";
import type { AuthUser } from "../../../common/scope/auth-user";
import type { UserRepository } from "../../auth/repositories/user.repository";
import type { RecipeRepository } from "../../recipes/repositories/recipe.repository";
import type { CommunityCommentRepository } from "../repositories/community-comment.repository";
import type { CommunityPostRepository } from "../repositories/community-post.repository";
import type { CommunityPostLikeRepository } from "../repositories/community-post-like.repository";
import type { CommunityReportRepository } from "../repositories/community-report.repository";
import type { CommunityUserBlockRepository } from "../repositories/community-user-block.repository";
import { CommunityService } from "./community.service";

// Valid 24-char hex ids: the service constructs real ObjectIds from them.
const AUTHOR_ID = "0000000000000000000000a1";
const OTHER_ID = "0000000000000000000000c1";
const POST_ID = "0000000000000000000000f1";

/** A stand-in ObjectId-like value whose `toString()` yields a fixed id. */
function oid(id: string): Types.ObjectId {
  return { toString: () => id } as unknown as Types.ObjectId;
}

/** Minimal post doc the mapper/flags read. */
function postDoc(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: POST_ID,
    createdBy: oid(AUTHOR_ID),
    authorName: "Author",
    authorAvatarUrl: null,
    caption: "hi",
    images: [],
    recipeId: null,
    recipeTitle: null,
    likeCount: 0,
    commentCount: 0,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

interface Mocks {
  posts: jest.Mocked<CommunityPostRepository>;
  likes: jest.Mocked<CommunityPostLikeRepository>;
  comments: jest.Mocked<CommunityCommentRepository>;
  reports: jest.Mocked<CommunityReportRepository>;
  blocks: jest.Mocked<CommunityUserBlockRepository>;
  users: jest.Mocked<UserRepository>;
  recipes: jest.Mocked<RecipeRepository>;
}

function build(): { service: CommunityService; mocks: Mocks } {
  const mocks = {
    posts: {
      findById: jest.fn(),
      listFeed: jest.fn(),
      countByAuthor: jest.fn(),
      softDelete: jest.fn(),
      create: jest.fn(),
      adjustLikeCount: jest.fn(),
      adjustCommentCount: jest.fn(),
    },
    likes: {
      findLive: jest.fn(),
      create: jest.fn(),
      softDeleteLive: jest.fn(),
      likedPostIds: jest.fn().mockResolvedValue(new Set()),
    },
    comments: {
      findById: jest.fn(),
      listByPost: jest.fn(),
      create: jest.fn(),
      softDeleteOwn: jest.fn(),
    },
    reports: { create: jest.fn() },
    blocks: {
      blockedUserIds: jest.fn().mockResolvedValue([]),
      findLive: jest.fn(),
      create: jest.fn(),
      softDeleteLive: jest.fn(),
    },
    users: { findById: jest.fn() },
    recipes: { findReadableById: jest.fn() },
  } as unknown as Mocks;

  const service = new CommunityService(
    mocks.posts,
    mocks.likes,
    mocks.comments,
    mocks.reports,
    mocks.blocks,
    mocks.users,
    mocks.recipes,
  );
  return { service, mocks };
}

const USER: AuthUser = { id: AUTHOR_ID, roles: ["user"] };
const OTHER: AuthUser = { id: OTHER_ID, roles: ["user"] };

describe("CommunityService", () => {
  describe("like toggle", () => {
    it("is idempotent and increments the counter exactly once", async () => {
      const { service, mocks } = build();
      mocks.posts.findById.mockResolvedValue(postDoc({ likeCount: 1 }) as never);
      // First like: no existing like -> create + inc.
      mocks.likes.findLive.mockResolvedValueOnce(null);
      await service.likePost(USER, POST_ID);
      // Second like: an existing live like -> no-op.
      mocks.likes.findLive.mockResolvedValueOnce({ id: "like1" } as never);
      await service.likePost(USER, POST_ID);

      expect(mocks.likes.create).toHaveBeenCalledTimes(1);
      expect(mocks.posts.adjustLikeCount).toHaveBeenCalledTimes(1);
      expect(mocks.posts.adjustLikeCount).toHaveBeenCalledWith(POST_ID, 1);
    });

    it("decrements only when a live like was actually removed", async () => {
      const { service, mocks } = build();
      mocks.posts.findById.mockResolvedValue(postDoc() as never);
      // Live like removed -> decrement.
      mocks.likes.softDeleteLive.mockResolvedValueOnce({ id: "like1" } as never);
      await service.unlikePost(USER, POST_ID);
      // Nothing to remove -> no decrement.
      mocks.likes.softDeleteLive.mockResolvedValueOnce(null);
      await service.unlikePost(USER, POST_ID);

      expect(mocks.posts.adjustLikeCount).toHaveBeenCalledTimes(1);
      expect(mocks.posts.adjustLikeCount).toHaveBeenCalledWith(POST_ID, -1);
    });
  });

  describe("comments", () => {
    it("increments the post's comment counter on add", async () => {
      const { service, mocks } = build();
      mocks.posts.findById.mockResolvedValue(postDoc() as never);
      mocks.users.findById.mockResolvedValue({
        displayName: "Author",
        avatarUrl: null,
      } as never);
      mocks.comments.create.mockResolvedValue({
        id: "c1",
        postId: oid(POST_ID),
        createdBy: oid(AUTHOR_ID),
        authorName: "Author",
        authorAvatarUrl: null,
        text: "nice",
        createdAt: new Date(),
      } as never);

      const res = await service.addComment(USER, POST_ID, { text: "nice" });

      expect(res.text).toBe("nice");
      expect(mocks.posts.adjustCommentCount).toHaveBeenCalledWith(POST_ID, 1);
    });

    it("lets the author delete their comment and decrements the counter", async () => {
      const { service, mocks } = build();
      mocks.comments.findById.mockResolvedValue({
        id: "c1",
        postId: oid(POST_ID),
        createdBy: oid(AUTHOR_ID),
      } as never);
      mocks.comments.softDeleteOwn.mockResolvedValue({ id: "c1" } as never);

      await service.deleteComment(USER, "c1");

      expect(mocks.comments.softDeleteOwn).toHaveBeenCalledWith("c1", AUTHOR_ID);
      expect(mocks.posts.adjustCommentCount).toHaveBeenCalledWith(POST_ID, -1);
    });

    it("rejects deleting another user's comment (author-only)", async () => {
      const { service, mocks } = build();
      mocks.comments.findById.mockResolvedValue({
        id: "c1",
        postId: oid(POST_ID),
        createdBy: oid(AUTHOR_ID),
      } as never);

      await expect(service.deleteComment(OTHER, "c1")).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(mocks.comments.softDeleteOwn).not.toHaveBeenCalled();
      expect(mocks.posts.adjustCommentCount).not.toHaveBeenCalled();
    });
  });

  describe("posts", () => {
    it("rejects deleting another user's post (author-only)", async () => {
      const { service, mocks } = build();
      mocks.posts.findById.mockResolvedValue(postDoc() as never);

      await expect(service.deletePost(OTHER, POST_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(mocks.posts.softDelete).not.toHaveBeenCalled();
    });

    it("soft-deletes the author's own post", async () => {
      const { service, mocks } = build();
      mocks.posts.findById.mockResolvedValue(postDoc() as never);

      await service.deletePost(USER, POST_ID);

      expect(mocks.posts.softDelete).toHaveBeenCalledWith(POST_ID, AUTHOR_ID);
    });
  });

  describe("feed", () => {
    it("excludes blocked authors on the global feed", async () => {
      const { service, mocks } = build();
      mocks.blocks.blockedUserIds.mockResolvedValue(["blocked1"]);
      mocks.posts.listFeed.mockResolvedValue({ items: [], total: 0 });

      await service.listFeed(USER, { limit: 20 });

      expect(mocks.posts.listFeed).toHaveBeenCalledWith(
        expect.objectContaining({ blockedAuthorIds: ["blocked1"] }),
      );
    });

    it("skips the block filter for a single-author (profile) listing", async () => {
      const { service, mocks } = build();
      mocks.posts.listFeed.mockResolvedValue({ items: [], total: 0 });

      await service.listFeed(USER, { limit: 20, authorId: "author2" });

      expect(mocks.blocks.blockedUserIds).not.toHaveBeenCalled();
      expect(mocks.posts.listFeed).toHaveBeenCalledWith(
        expect.objectContaining({ authorId: "author2", blockedAuthorIds: [] }),
      );
    });
  });

  describe("reports & blocks", () => {
    it("creates an open report against a post", async () => {
      const { service, mocks } = build();
      mocks.posts.findById.mockResolvedValue(postDoc() as never);

      await service.reportPost(USER, POST_ID, { reason: "spam" });

      expect(mocks.reports.create).toHaveBeenCalledWith(
        expect.objectContaining({ targetType: "post", reason: "spam", status: "open" }),
        AUTHOR_ID,
      );
    });

    it("rejects blocking yourself", async () => {
      const { service, mocks } = build();

      await expect(service.blockUser(USER, AUTHOR_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(mocks.blocks.create).not.toHaveBeenCalled();
    });
  });
});
