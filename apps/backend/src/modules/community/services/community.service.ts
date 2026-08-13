import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  CommunityCommentResponse,
  CommunityFeedQuery,
  CommunityLikeResponse,
  CommunityPostResponse,
  CommunityUserProfile,
  CreateCommunityCommentInput,
  CreateCommunityPostInput,
  CreateCommunityReportInput,
  PaginationQuery,
} from "@kitchenpal/api-contract";
import { Types, type HydratedDocument } from "mongoose";
import { isDuplicateKeyError } from "../../../common/database/mongo-errors";
import { ErrorCode } from "../../../common/http/error-codes";
import { PageResult, paginate } from "../../../common/http/page-result";
import type { AuthUser } from "../../../common/scope/auth-user";
import type { ScopeContext } from "../../../common/scope/scope-context";
import { UserRepository } from "../../auth/repositories/user.repository";
import { RecipeRepository } from "../../recipes/repositories/recipe.repository";
import {
  CommunityCommentRepository,
  type CommunityCommentEntity,
} from "../repositories/community-comment.repository";
import {
  CommunityPostRepository,
  type CommunityPostEntity,
} from "../repositories/community-post.repository";
import { CommunityPostLikeRepository } from "../repositories/community-post-like.repository";
import {
  CommunityReportRepository,
  type CommunityReportEntity,
} from "../repositories/community-report.repository";
import { CommunityUserBlockRepository } from "../repositories/community-user-block.repository";

type PostDoc = HydratedDocument<CommunityPostEntity>;
type CommentDoc = HydratedDocument<CommunityCommentEntity>;

/** The denormalized author identity stamped onto posts and comments. */
interface AuthorIdentity {
  authorName: string;
  authorAvatarUrl: string | null;
}

/**
 * Community feed domain service: the public feed (block/soft-delete aware),
 * posts CRUD, idempotent likes, flat comments, moderation reports, and user
 * blocks/profiles. Community content is public/global, so identity comes from
 * the authenticated {@link AuthUser} (never a client-supplied id) and author
 * name/avatar are denormalized at write time — internal user ids are never
 * exposed to readers. Derived counters (`likeCount`/`commentCount`) are kept
 * correct with atomic, guarded `$inc`.
 */
@Injectable()
export class CommunityService {
  constructor(
    private readonly posts: CommunityPostRepository,
    private readonly likes: CommunityPostLikeRepository,
    private readonly comments: CommunityCommentRepository,
    private readonly reports: CommunityReportRepository,
    private readonly blocks: CommunityUserBlockRepository,
    private readonly users: UserRepository,
    private readonly recipes: RecipeRepository,
  ) {}

  // --- Feed & posts -----------------------------------------------------

  async listFeed(
    user: AuthUser,
    query: CommunityFeedQuery,
  ): Promise<PageResult<CommunityPostResponse>> {
    const skip = decodeCursor(query.cursor);
    // A profile listing (authorId set) shows that author's posts directly; the
    // block exclusion only applies to the global feed.
    const blockedAuthorIds = query.authorId
      ? []
      : await this.blocks.blockedUserIds(user.id);
    const { items, total } = await this.posts.listFeed({
      authorId: query.authorId,
      blockedAuthorIds,
      skip,
      limit: query.limit,
    });
    return this.pageOfPosts(items, user.id, skip, total);
  }

  /**
   * Maps a page of post docs to responses, batching the caller's liked-post
   * lookup so a feed page costs a single extra query rather than one per post.
   */
  private async pageOfPosts(
    items: PostDoc[],
    userId: string,
    skip: number,
    total: number,
  ): Promise<PageResult<CommunityPostResponse>> {
    const likedIds = await this.likes.likedPostIds(
      items.map((doc) => doc.id),
      userId,
    );
    const nextSkip = skip + items.length;
    return paginate(
      items.map((doc) =>
        toPostResponse(doc, {
          likedByMe: likedIds.has(doc.id),
          isOwner: isOwner(doc, userId),
        }),
      ),
      { nextCursor: nextSkip < total ? encodeCursor(nextSkip) : null, total },
    );
  }

  async createPost(
    user: AuthUser,
    input: CreateCommunityPostInput,
  ): Promise<CommunityPostResponse> {
    const author = await this.resolveAuthor(user.id);
    const recipe = await this.resolveRecipe(user, input.recipeId ?? null);
    const doc = await this.posts.create(
      {
        authorName: author.authorName,
        authorAvatarUrl: author.authorAvatarUrl,
        caption: input.caption,
        images: input.images,
        recipeId: recipe?.id ? new Types.ObjectId(recipe.id) : null,
        recipeTitle: recipe?.name ?? null,
      } as Partial<CommunityPostEntity>,
      user.id,
    );
    // A freshly created post cannot be liked yet and is always owned by its
    // author, so those flags are known without a lookup.
    return toPostResponse(doc, { likedByMe: false, isOwner: true });
  }

  async getPost(
    user: AuthUser,
    id: string,
  ): Promise<CommunityPostResponse> {
    const post = await this.requirePost(id);
    const likedByMe = (await this.likes.findLive(id, user.id)) !== null;
    return toPostResponse(post, {
      likedByMe,
      isOwner: isOwner(post, user.id),
    });
  }

  async deletePost(user: AuthUser, id: string): Promise<void> {
    const post = await this.requirePost(id);
    if (!isOwner(post, user.id)) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: "You can only delete your own posts",
        details: { id },
      });
    }
    await this.posts.softDelete(id, user.id);
  }

  // --- Likes ------------------------------------------------------------

  async likePost(user: AuthUser, id: string): Promise<CommunityLikeResponse> {
    await this.requirePost(id);
    const existing = await this.likes.findLive(id, user.id);
    if (!existing) {
      try {
        await this.likes.create(
          { postId: new Types.ObjectId(id) },
          user.id,
        );
        await this.posts.adjustLikeCount(id, 1);
      } catch (error) {
        // A concurrent like won the unique index: the like already exists, so
        // this call is a no-op — never double-count.
        if (!isDuplicateKeyError(error)) {
          throw error;
        }
      }
    }
    return this.likeStateOf(id, true);
  }

  async unlikePost(user: AuthUser, id: string): Promise<CommunityLikeResponse> {
    await this.requirePost(id);
    // Atomic soft-delete guarantees exactly one concurrent unlike decrements.
    const removed = await this.likes.softDeleteLive(id, user.id);
    if (removed) {
      await this.posts.adjustLikeCount(id, -1);
    }
    return this.likeStateOf(id, false);
  }

  // --- Comments ---------------------------------------------------------

  async listComments(
    id: string,
    userId: string,
    query: PaginationQuery,
  ): Promise<PageResult<CommunityCommentResponse>> {
    await this.requirePost(id);
    const skip = decodeCursor(query.cursor);
    const { items, total } = await this.comments.listByPost(
      id,
      skip,
      query.limit,
    );
    const nextSkip = skip + items.length;
    return paginate(
      items.map((doc) => toCommentResponse(doc, userId)),
      { nextCursor: nextSkip < total ? encodeCursor(nextSkip) : null, total },
    );
  }

  async addComment(
    user: AuthUser,
    id: string,
    input: CreateCommunityCommentInput,
  ): Promise<CommunityCommentResponse> {
    await this.requirePost(id);
    const author = await this.resolveAuthor(user.id);
    const doc = await this.comments.create(
      {
        postId: new Types.ObjectId(id),
        authorName: author.authorName,
        authorAvatarUrl: author.authorAvatarUrl,
        text: input.text,
      } as Partial<CommunityCommentEntity>,
      user.id,
    );
    await this.posts.adjustCommentCount(id, 1);
    return toCommentResponse(doc, user.id);
  }

  async deleteComment(user: AuthUser, commentId: string): Promise<void> {
    const comment = await this.comments.findById(commentId);
    if (!comment) {
      throw this.notFound(commentId, "Comment");
    }
    if (!isOwner(comment, user.id)) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: "You can only delete your own comments",
        details: { id: commentId },
      });
    }
    const removed = await this.comments.softDeleteOwn(commentId, user.id);
    if (removed) {
      await this.posts.adjustCommentCount(comment.postId.toString(), -1);
    }
  }

  // --- Reports ----------------------------------------------------------

  async reportPost(
    user: AuthUser,
    id: string,
    input: CreateCommunityReportInput,
  ): Promise<void> {
    await this.requirePost(id);
    await this.createReport(user.id, "post", id, input);
  }

  async reportComment(
    user: AuthUser,
    id: string,
    input: CreateCommunityReportInput,
  ): Promise<void> {
    const comment = await this.comments.findById(id);
    if (!comment) {
      throw this.notFound(id, "Comment");
    }
    await this.createReport(user.id, "comment", id, input);
  }

  // --- Blocks & profiles ------------------------------------------------

  async blockUser(user: AuthUser, targetId: string): Promise<void> {
    if (targetId === user.id) {
      throw new BadRequestException({
        code: ErrorCode.CANNOT_BLOCK_SELF,
        message: "You cannot block yourself",
      });
    }
    try {
      await this.blocks.create(
        { blockedUserId: new Types.ObjectId(targetId) },
        user.id,
      );
    } catch (error) {
      // Already blocked (unique index): blocking is idempotent.
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
    }
  }

  async unblockUser(user: AuthUser, targetId: string): Promise<void> {
    await this.blocks.softDeleteLive(user.id, targetId);
  }

  async getUserProfile(
    user: AuthUser,
    targetId: string,
  ): Promise<CommunityUserProfile> {
    const target = await this.users.findById(targetId);
    if (!target) {
      throw this.notFound(targetId, "User");
    }
    const [postCount, block] = await Promise.all([
      this.posts.countByAuthor(targetId),
      this.blocks.findLive(user.id, targetId),
    ]);
    return {
      id: target.id,
      displayName: target.displayName,
      avatarUrl: target.avatarUrl ?? null,
      postCount,
      blockedByMe: block !== null,
      isSelf: target.id === user.id,
    };
  }

  // --- Internals --------------------------------------------------------

  private async createReport(
    reporterId: string,
    targetType: "post" | "comment",
    targetId: string,
    input: CreateCommunityReportInput,
  ): Promise<void> {
    await this.reports.create(
      {
        targetType,
        targetId: new Types.ObjectId(targetId),
        reason: input.reason,
        detail: input.detail ?? null,
        status: "open",
      } as Partial<CommunityReportEntity>,
      reporterId,
    );
  }

  /**
   * Resolves the author's denormalized name/avatar from their account. A missing
   * account degrades to empty identity rather than failing the write.
   */
  private async resolveAuthor(userId: string): Promise<AuthorIdentity> {
    const account = await this.users.findById(userId);
    return {
      authorName: account?.displayName ?? "",
      authorAvatarUrl: account?.avatarUrl ?? null,
    };
  }

  /**
   * Resolves an attached recipe the caller may read (own, system, or published),
   * so its title can be denormalized. A recipe the caller cannot see is rejected
   * rather than silently dropped, so an opaque id is never attached blindly.
   */
  private async resolveRecipe(
    user: AuthUser,
    recipeId: string | null,
  ): Promise<{ id: string; name: string } | null> {
    if (!recipeId) {
      return null;
    }
    const scope = readScopeFor(user);
    const recipe = await this.recipes.findReadableById(scope, recipeId);
    if (!recipe) {
      throw this.notFound(recipeId, "Recipe");
    }
    return { id: recipe.id, name: recipe.name };
  }

  private async likeStateOf(
    id: string,
    likedByMe: boolean,
  ): Promise<CommunityLikeResponse> {
    const post = await this.posts.findById(id);
    return { postId: id, likedByMe, likeCount: post?.likeCount ?? 0 };
  }

  private async requirePost(id: string): Promise<PostDoc> {
    const post = await this.posts.findById(id);
    if (!post) {
      throw this.notFound(id, "Post");
    }
    return post;
  }

  private notFound(id: string, label: string): NotFoundException {
    return new NotFoundException({
      code: ErrorCode.NOT_FOUND,
      message: `${label} not found`,
      details: { id },
    });
  }
}

/** True when `userId` authored the document (its `createdBy`). */
function isOwner(
  doc: { createdBy?: Types.ObjectId | null },
  userId: string,
): boolean {
  return doc.createdBy?.toString() === userId;
}

/**
 * The scope used to resolve a recipe the author may attach. Derived from the
 * verified principal: household when they are acting in one, else personal. The
 * repository's readable filter also admits system and published recipes.
 */
function readScopeFor(user: AuthUser): ScopeContext {
  return user.activeHouseholdId
    ? {
        scope: "household",
        userId: user.id,
        householdId: user.activeHouseholdId,
      }
    : { scope: "personal", userId: user.id, householdId: null };
}

function toPostResponse(
  doc: PostDoc,
  flags: { likedByMe: boolean; isOwner: boolean },
): CommunityPostResponse {
  return {
    id: doc.id,
    authorId: doc.createdBy?.toString() ?? "",
    authorName: doc.authorName ?? "",
    authorAvatarUrl: doc.authorAvatarUrl ?? null,
    caption: doc.caption ?? "",
    images: doc.images ?? [],
    recipeId: doc.recipeId ? doc.recipeId.toString() : null,
    recipeTitle: doc.recipeTitle ?? null,
    likeCount: doc.likeCount ?? 0,
    commentCount: doc.commentCount ?? 0,
    likedByMe: flags.likedByMe,
    isOwner: flags.isOwner,
    createdAt: (doc.createdAt ?? new Date()).toISOString(),
  };
}

function toCommentResponse(
  doc: CommentDoc,
  userId: string,
): CommunityCommentResponse {
  return {
    id: doc.id,
    postId: doc.postId.toString(),
    authorId: doc.createdBy?.toString() ?? "",
    authorName: doc.authorName ?? "",
    authorAvatarUrl: doc.authorAvatarUrl ?? null,
    text: doc.text,
    isOwner: isOwner(doc, userId),
    createdAt: (doc.createdAt ?? new Date()).toISOString(),
  };
}

/** Cursor is an opaque base64 of the numeric offset (shared feed convention). */
function encodeCursor(offset: number): string {
  return Buffer.from(String(offset), "utf8").toString("base64url");
}

function decodeCursor(cursor: string | undefined): number {
  if (!cursor) {
    return 0;
  }
  const decoded = Number.parseInt(
    Buffer.from(cursor, "base64url").toString("utf8"),
    10,
  );
  return Number.isFinite(decoded) && decoded >= 0 ? decoded : 0;
}
