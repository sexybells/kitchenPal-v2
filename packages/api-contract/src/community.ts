import { z } from "zod";
import { objectIdSchema } from "./pantry.js";
import { paginationQuerySchema } from "./pagination.js";

/**
 * Community feed contracts. Unlike recipes/pantry (personal/household scoped),
 * community content is **public/global**: every user sees every (non-deleted,
 * non-blocked) post. Author user ids are never exposed to readers — posts and
 * comments carry a denormalized `authorId` (opaque, used only for profile links
 * and block) plus `authorName`/`authorAvatarUrl`.
 */

/** Hard limits shared by client and server so both validate identically. */
export const POST_CAPTION_MAX = 2000;
export const POST_IMAGES_MAX = 10;
export const COMMENT_TEXT_MAX = 1000;

/** A single post in the public feed. */
export const communityPostResponseSchema = z.object({
  id: z.string(),
  /** Opaque author id — used for profile navigation and block, not display. */
  authorId: z.string(),
  authorName: z.string(),
  authorAvatarUrl: z.string().nullable(),
  caption: z.string(),
  images: z.array(z.string()),
  /** Attached recipe, when the post shares one. */
  recipeId: z.string().nullable(),
  recipeTitle: z.string().nullable(),
  likeCount: z.number(),
  commentCount: z.number(),
  /** Whether the calling user has liked this post. */
  likedByMe: z.boolean(),
  /** True when the caller authored the post (may delete it). */
  isOwner: z.boolean(),
  createdAt: z.string(),
});
export type CommunityPostResponse = z.infer<
  typeof communityPostResponseSchema
>;

/**
 * Create a post. At least a caption or one image is required (a bare post with
 * neither is rejected). `recipeId` optionally attaches an owned/community recipe;
 * the server denormalizes its title.
 */
export const createCommunityPostSchema = z
  .object({
    caption: z.string().max(POST_CAPTION_MAX).default(""),
    images: z.array(z.string().url().max(2000)).max(POST_IMAGES_MAX).default([]),
    recipeId: objectIdSchema.nullable().optional(),
  })
  .refine((p) => p.caption.trim().length > 0 || p.images.length > 0, {
    message: "A post needs a caption or at least one image",
    path: ["caption"],
  });
export type CreateCommunityPostInput = z.infer<
  typeof createCommunityPostSchema
>;

/** Public feed query: newest first, cursor-paginated. */
export const communityFeedQuerySchema = paginationQuerySchema.extend({
  /** Limit the feed to a single author (used by profile screens). */
  authorId: objectIdSchema.optional(),
});
export type CommunityFeedQuery = z.infer<typeof communityFeedQuerySchema>;

/** A flat comment on a post. */
export const communityCommentResponseSchema = z.object({
  id: z.string(),
  postId: z.string(),
  authorId: z.string(),
  authorName: z.string(),
  authorAvatarUrl: z.string().nullable(),
  text: z.string(),
  isOwner: z.boolean(),
  createdAt: z.string(),
});
export type CommunityCommentResponse = z.infer<
  typeof communityCommentResponseSchema
>;

export const createCommunityCommentSchema = z.object({
  text: z.string().trim().min(1).max(COMMENT_TEXT_MAX),
});
export type CreateCommunityCommentInput = z.infer<
  typeof createCommunityCommentSchema
>;

/** Toggle-like result: current like state + fresh count for the post. */
export const communityLikeResponseSchema = z.object({
  postId: z.string(),
  likedByMe: z.boolean(),
  likeCount: z.number(),
});
export type CommunityLikeResponse = z.infer<
  typeof communityLikeResponseSchema
>;

/** Reasons a post/comment can be reported. */
export const communityReportReasonSchema = z.enum([
  "spam",
  "offensive",
  "harassment",
  "inappropriate",
  "other",
]);
export type CommunityReportReason = z.infer<
  typeof communityReportReasonSchema
>;

export const createCommunityReportSchema = z.object({
  reason: communityReportReasonSchema,
  detail: z.string().max(500).optional(),
});
export type CreateCommunityReportInput = z.infer<
  typeof createCommunityReportSchema
>;

/** Basic public profile: identity + post count. */
export const communityUserProfileSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  postCount: z.number(),
  /** True when the caller has blocked this user. */
  blockedByMe: z.boolean(),
  /** True when this profile is the caller's own. */
  isSelf: z.boolean(),
});
export type CommunityUserProfile = z.infer<
  typeof communityUserProfileSchema
>;

/* ── Admin moderation ─────────────────────────────────────────────── */

export const communityReportStatusSchema = z.enum([
  "open",
  "reviewed",
  "dismissed",
]);
export type CommunityReportStatus = z.infer<
  typeof communityReportStatusSchema
>;

export const adminCommunityReportQuerySchema = paginationQuerySchema.extend({
  status: communityReportStatusSchema.default("open"),
});
export type AdminCommunityReportQuery = z.infer<
  typeof adminCommunityReportQuerySchema
>;

/** A moderation report as the admin console sees it, with target preview. */
export const adminCommunityReportResponseSchema = z.object({
  id: z.string(),
  targetType: z.enum(["post", "comment"]),
  targetId: z.string(),
  reason: communityReportReasonSchema,
  detail: z.string().nullable(),
  status: communityReportStatusSchema,
  reporterName: z.string(),
  /** Text/caption of the reported content, or null if already removed. */
  targetPreview: z.string().nullable(),
  targetAuthorName: z.string().nullable(),
  createdAt: z.string(),
});
export type AdminCommunityReportResponse = z.infer<
  typeof adminCommunityReportResponseSchema
>;
