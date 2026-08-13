import { z } from "zod";
import {
  communityCommentResponseSchema,
  communityLikeResponseSchema,
  communityPostResponseSchema,
  communityUserProfileSchema,
  type CommunityCommentResponse,
  type CommunityLikeResponse,
  type CommunityPostResponse,
  type CommunityUserProfile,
  type CreateCommunityCommentInput,
  type CreateCommunityPostInput,
  type CreateCommunityReportInput,
} from "@kitchenpal/api-contract";
import { api } from "./api";
import type { ScanImageSource } from "./pantry";

/** Newly uploaded image URL returned by `POST /uploads/community-image`. */
const uploadResponseSchema = z.object({ url: z.string() });

/** A cursor page of feed posts. */
export interface PostPage {
  items: CommunityPostResponse[];
  nextCursor: string | null;
}

/** Serialise a cursor page query into a `?a=b` string, skipping empty values. */
const toPageQuery = (query: { cursor?: string; limit?: number }): string => {
  const params = new URLSearchParams();
  if (query.cursor) params.set("cursor", query.cursor);
  if (query.limit) params.set("limit", String(query.limit));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
};

/**
 * Community endpoint wrappers — each unwraps + validates the response envelope,
 * mirroring `recipesApi`. Community content is public/global; every call still
 * requires the access token so the server can resolve `likedByMe`/`isOwner`.
 */
export const communityApi = {
  feed: (query: { cursor?: string; limit?: number } = {}): Promise<PostPage> =>
    api
      .requestPage(`community/posts${toPageQuery(query)}`, communityPostResponseSchema, {
        method: "GET",
        auth: true,
      })
      .then((result) => ({ items: result.items, nextCursor: result.page.nextCursor })),

  userPosts: (
    userId: string,
    query: { cursor?: string; limit?: number } = {},
  ): Promise<PostPage> =>
    api
      .requestPage(
        `community/users/${userId}/posts${toPageQuery(query)}`,
        communityPostResponseSchema,
        { method: "GET", auth: true },
      )
      .then((result) => ({ items: result.items, nextCursor: result.page.nextCursor })),

  createPost: (input: CreateCommunityPostInput): Promise<CommunityPostResponse> =>
    api.request("community/posts", {
      body: input,
      auth: true,
      schema: communityPostResponseSchema,
    }),

  getPost: (id: string): Promise<CommunityPostResponse> =>
    api.request(`community/posts/${id}`, {
      method: "GET",
      auth: true,
      schema: communityPostResponseSchema,
    }),

  deletePost: (id: string): Promise<void> =>
    api
      .request(`community/posts/${id}`, { method: "DELETE", auth: true })
      .then(() => undefined),

  setLike: (id: string, like: boolean): Promise<CommunityLikeResponse> =>
    api.request(`community/posts/${id}/like`, {
      method: like ? "POST" : "DELETE",
      auth: true,
      schema: communityLikeResponseSchema,
    }),

  comments: (
    id: string,
    query: { cursor?: string; limit?: number } = {},
  ): Promise<CommunityCommentResponse[]> =>
    api
      .requestPage(
        `community/posts/${id}/comments${toPageQuery(query)}`,
        communityCommentResponseSchema,
        { method: "GET", auth: true },
      )
      .then((result) => result.items),

  addComment: (
    id: string,
    input: CreateCommunityCommentInput,
  ): Promise<CommunityCommentResponse> =>
    api.request(`community/posts/${id}/comments`, {
      body: input,
      auth: true,
      schema: communityCommentResponseSchema,
    }),

  deleteComment: (id: string): Promise<void> =>
    api
      .request(`community/comments/${id}`, { method: "DELETE", auth: true })
      .then(() => undefined),

  reportPost: (id: string, input: CreateCommunityReportInput): Promise<void> =>
    api
      .request(`community/posts/${id}/report`, { body: input, auth: true })
      .then(() => undefined),

  reportComment: (
    id: string,
    input: CreateCommunityReportInput,
  ): Promise<void> =>
    api
      .request(`community/comments/${id}/report`, { body: input, auth: true })
      .then(() => undefined),

  setBlock: (userId: string, block: boolean): Promise<void> =>
    api
      .request(`community/users/${userId}/block`, {
        method: block ? "POST" : "DELETE",
        auth: true,
      })
      .then(() => undefined),

  userProfile: (userId: string): Promise<CommunityUserProfile> =>
    api.request(`community/users/${userId}`, {
      method: "GET",
      auth: true,
      schema: communityUserProfileSchema,
    }),

  uploadImage: (image: ScanImageSource): Promise<string> => {
    const form = new FormData();
    // React Native FormData accepts a `{ uri, name, type }` file descriptor.
    // Field name MUST be `file` — the backend uploads controller reads it via
    // `FileInterceptor("file")` (same field as the avatar endpoint).
    form.append("file", {
      uri: image.uri,
      name: image.name,
      type: image.mimeType,
    } as unknown as Blob);
    return api
      .request("uploads/community-image", {
        body: form,
        auth: true,
        schema: uploadResponseSchema,
      })
      .then((result) => result.url);
  },
};
