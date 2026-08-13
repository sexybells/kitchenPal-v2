import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  communityFeedQuerySchema,
  createCommunityCommentSchema,
  createCommunityPostSchema,
  createCommunityReportSchema,
  objectIdSchema,
  paginationQuerySchema,
  type CommunityCommentResponse,
  type CommunityFeedQuery,
  type CommunityLikeResponse,
  type CommunityPostResponse,
  type CommunityUserProfile,
  type CreateCommunityCommentInput,
  type CreateCommunityPostInput,
  type CreateCommunityReportInput,
  type PaginationQuery,
} from "@kitchenpal/api-contract";
import type { PageResult } from "../../common/http/page-result";
import type { AuthUser } from "../../common/scope/auth-user";
import { CurrentUser } from "../../common/scope/current-user.decorator";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { CommunityService } from "./services/community.service";

/**
 * Public community feed: posts, likes, flat comments, moderation reports, and
 * user blocks/profiles. Every route is JWT-guarded (the global auth guard) and
 * identity is taken from the verified {@link AuthUser}, never a client body.
 * Community content is global/public, so there is no `@Scope()` here.
 *
 * Static sub-paths (`/comments/...`, `/users/...`) are declared before the
 * `posts/:id` routes so Nest matches them first (routes resolve in order).
 */
@ApiTags("community")
@ApiBearerAuth()
@Controller("community")
export class CommunityController {
  constructor(private readonly community: CommunityService) {}

  @Get("posts")
  @ApiOperation({ summary: "Public feed (newest first, cursor-paginated)" })
  listFeed(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(communityFeedQuerySchema))
    query: CommunityFeedQuery,
  ): Promise<PageResult<CommunityPostResponse>> {
    return this.community.listFeed(user, query);
  }

  @Post("posts")
  @ApiOperation({ summary: "Create a community post" })
  createPost(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createCommunityPostSchema))
    body: CreateCommunityPostInput,
  ): Promise<CommunityPostResponse> {
    return this.community.createPost(user, body);
  }

  @Get("posts/:id")
  @ApiOperation({ summary: "Get a single post" })
  getPost(
    @CurrentUser() user: AuthUser,
    @Param("id", new ZodValidationPipe(objectIdSchema)) id: string,
  ): Promise<CommunityPostResponse> {
    return this.community.getPost(user, id);
  }

  @Delete("posts/:id")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Soft-delete an owned post" })
  async deletePost(
    @CurrentUser() user: AuthUser,
    @Param("id", new ZodValidationPipe(objectIdSchema)) id: string,
  ): Promise<{ deleted: boolean }> {
    await this.community.deletePost(user, id);
    return { deleted: true };
  }

  @Post("posts/:id/like")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Like a post (idempotent)" })
  likePost(
    @CurrentUser() user: AuthUser,
    @Param("id", new ZodValidationPipe(objectIdSchema)) id: string,
  ): Promise<CommunityLikeResponse> {
    return this.community.likePost(user, id);
  }

  @Delete("posts/:id/like")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Unlike a post (idempotent)" })
  unlikePost(
    @CurrentUser() user: AuthUser,
    @Param("id", new ZodValidationPipe(objectIdSchema)) id: string,
  ): Promise<CommunityLikeResponse> {
    return this.community.unlikePost(user, id);
  }

  @Get("posts/:id/comments")
  @ApiOperation({ summary: "List a post's comments (cursor-paginated)" })
  listComments(
    @CurrentUser() user: AuthUser,
    @Param("id", new ZodValidationPipe(objectIdSchema)) id: string,
    @Query(new ZodValidationPipe(paginationQuerySchema))
    query: PaginationQuery,
  ): Promise<PageResult<CommunityCommentResponse>> {
    return this.community.listComments(id, user.id, query);
  }

  @Post("posts/:id/comments")
  @ApiOperation({ summary: "Add a comment to a post" })
  addComment(
    @CurrentUser() user: AuthUser,
    @Param("id", new ZodValidationPipe(objectIdSchema)) id: string,
    @Body(new ZodValidationPipe(createCommunityCommentSchema))
    body: CreateCommunityCommentInput,
  ): Promise<CommunityCommentResponse> {
    return this.community.addComment(user, id, body);
  }

  @Delete("comments/:id")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Soft-delete an owned comment" })
  async deleteComment(
    @CurrentUser() user: AuthUser,
    @Param("id", new ZodValidationPipe(objectIdSchema)) id: string,
  ): Promise<{ deleted: boolean }> {
    await this.community.deleteComment(user, id);
    return { deleted: true };
  }

  @Post("posts/:id/report")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Report a post" })
  async reportPost(
    @CurrentUser() user: AuthUser,
    @Param("id", new ZodValidationPipe(objectIdSchema)) id: string,
    @Body(new ZodValidationPipe(createCommunityReportSchema))
    body: CreateCommunityReportInput,
  ): Promise<{ reported: boolean }> {
    await this.community.reportPost(user, id, body);
    return { reported: true };
  }

  @Post("comments/:id/report")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Report a comment" })
  async reportComment(
    @CurrentUser() user: AuthUser,
    @Param("id", new ZodValidationPipe(objectIdSchema)) id: string,
    @Body(new ZodValidationPipe(createCommunityReportSchema))
    body: CreateCommunityReportInput,
  ): Promise<{ reported: boolean }> {
    await this.community.reportComment(user, id, body);
    return { reported: true };
  }

  @Post("users/:id/block")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Block a user (idempotent; cannot block self)" })
  async blockUser(
    @CurrentUser() user: AuthUser,
    @Param("id", new ZodValidationPipe(objectIdSchema)) id: string,
  ): Promise<{ blocked: boolean }> {
    await this.community.blockUser(user, id);
    return { blocked: true };
  }

  @Delete("users/:id/block")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Unblock a user (idempotent)" })
  async unblockUser(
    @CurrentUser() user: AuthUser,
    @Param("id", new ZodValidationPipe(objectIdSchema)) id: string,
  ): Promise<{ blocked: boolean }> {
    await this.community.unblockUser(user, id);
    return { blocked: false };
  }

  @Get("users/:id")
  @ApiOperation({ summary: "Get a user's basic community profile" })
  getUserProfile(
    @CurrentUser() user: AuthUser,
    @Param("id", new ZodValidationPipe(objectIdSchema)) id: string,
  ): Promise<CommunityUserProfile> {
    return this.community.getUserProfile(user, id);
  }

  @Get("users/:id/posts")
  @ApiOperation({ summary: "List a user's posts (cursor-paginated)" })
  listUserPosts(
    @CurrentUser() user: AuthUser,
    @Param("id", new ZodValidationPipe(objectIdSchema)) id: string,
    @Query(new ZodValidationPipe(paginationQuerySchema))
    query: PaginationQuery,
  ): Promise<PageResult<CommunityPostResponse>> {
    return this.community.listFeed(user, { ...query, authorId: id });
  }
}
