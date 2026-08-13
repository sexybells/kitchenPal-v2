import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query";
import type {
  CommunityLikeResponse,
  CommunityPostResponse,
  CreateCommunityCommentInput,
  CreateCommunityPostInput,
  CreateCommunityReportInput,
} from "@kitchenpal/api-contract";
import { communityApi, type PostPage } from "../../api/community";
import type { ScanImageSource } from "../../api/pantry";

/** Community query keys — centralised so mutations invalidate cleanly. */
export const communityKeys = {
  all: ["community"] as const,
  feed: (authorId?: string) => ["community", "feed", authorId ?? "all"] as const,
  post: (id: string) => ["community", "post", id] as const,
  comments: (id: string) => ["community", "comments", id] as const,
  profile: (id: string) => ["community", "profile", id] as const,
};

/**
 * The public feed (or a single author's posts when `authorId` is set) as an
 * infinite cursor query. `getNextPageParam` reads the server `nextCursor`;
 * `undefined` means there is no further page.
 */
export const useCommunityFeed = (authorId?: string) =>
  useInfiniteQuery({
    queryKey: communityKeys.feed(authorId),
    queryFn: ({ pageParam }) =>
      authorId
        ? communityApi.userPosts(authorId, { cursor: pageParam })
        : communityApi.feed({ cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

export const usePost = (id: string | null) =>
  useQuery({
    queryKey: communityKeys.post(id ?? "none"),
    queryFn: () => communityApi.getPost(id as string),
    enabled: id !== null,
  });

export const usePostComments = (id: string | null) =>
  useQuery({
    queryKey: communityKeys.comments(id ?? "none"),
    queryFn: () => communityApi.comments(id as string),
    enabled: id !== null,
  });

export const useUserProfile = (id: string | null) =>
  useQuery({
    queryKey: communityKeys.profile(id ?? "none"),
    queryFn: () => communityApi.userProfile(id as string),
    enabled: id !== null,
  });

/** Apply a like result to a single post object. */
const withLike = (
  post: CommunityPostResponse,
  like: CommunityLikeResponse,
): CommunityPostResponse =>
  post.id === like.postId
    ? { ...post, likedByMe: like.likedByMe, likeCount: like.likeCount }
    : post;

/** Optimistically flip a post's like state across every cached feed page. */
const patchFeeds = (
  client: QueryClient,
  postId: string,
  patch: (post: CommunityPostResponse) => CommunityPostResponse,
) => {
  const feeds = client.getQueriesData<InfiniteData<PostPage>>({
    queryKey: communityKeys.all,
  });
  for (const [key, data] of feeds) {
    if (!data || !("pages" in data)) continue;
    client.setQueryData<InfiniteData<PostPage>>(key, {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        items: page.items.map((post) =>
          post.id === postId ? patch(post) : post,
        ),
      })),
    });
  }
};

/**
 * Toggle a post like with an optimistic heart: flip `likedByMe` + adjust
 * `likeCount` everywhere the post appears (feed pages + detail), rolling back on
 * error and reconciling with the authoritative server count on success. Mirrors
 * `useToggleFavorite`.
 */
export const useToggleLike = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, like }: { id: string; like: boolean }) =>
      communityApi.setLike(id, like),
    onMutate: async ({ id, like }) => {
      await client.cancelQueries({ queryKey: communityKeys.all });
      const feeds = client.getQueriesData<InfiniteData<PostPage>>({
        queryKey: communityKeys.all,
      });
      const detail = client.getQueryData<CommunityPostResponse>(
        communityKeys.post(id),
      );
      const optimistic = (post: CommunityPostResponse): CommunityPostResponse =>
        post.id === id
          ? {
              ...post,
              likedByMe: like,
              likeCount: Math.max(0, post.likeCount + (like ? 1 : -1)),
            }
          : post;
      patchFeeds(client, id, optimistic);
      if (detail) client.setQueryData(communityKeys.post(id), optimistic(detail));
      return { feeds, detail };
    },
    onError: (_error, { id }, context) => {
      for (const [key, data] of context?.feeds ?? []) {
        client.setQueryData(key, data);
      }
      if (context?.detail) {
        client.setQueryData(communityKeys.post(id), context.detail);
      }
    },
    onSuccess: (result) => {
      patchFeeds(client, result.postId, (post) => withLike(post, result));
      const detail = client.getQueryData<CommunityPostResponse>(
        communityKeys.post(result.postId),
      );
      if (detail) {
        client.setQueryData(communityKeys.post(result.postId), withLike(detail, result));
      }
    },
  });
};

export const useCreatePost = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCommunityPostInput) => communityApi.createPost(input),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: communityKeys.feed() }),
  });
};

export const useDeletePost = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => communityApi.deletePost(id),
    onSuccess: () => client.invalidateQueries({ queryKey: communityKeys.all }),
  });
};

export const useAddComment = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CreateCommunityCommentInput }) =>
      communityApi.addComment(id, input),
    onSuccess: (_data, { id }) => {
      void client.invalidateQueries({ queryKey: communityKeys.comments(id) });
      void client.invalidateQueries({ queryKey: communityKeys.post(id) });
      void client.invalidateQueries({ queryKey: communityKeys.feed() });
    },
  });
};

export const useDeleteComment = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ commentId }: { commentId: string; postId: string }) =>
      communityApi.deleteComment(commentId),
    onSuccess: (_data, { postId }) => {
      void client.invalidateQueries({ queryKey: communityKeys.comments(postId) });
      void client.invalidateQueries({ queryKey: communityKeys.post(postId) });
    },
  });
};

export const useReport = () =>
  useMutation({
    mutationFn: ({
      targetType,
      id,
      input,
    }: {
      targetType: "post" | "comment";
      id: string;
      input: CreateCommunityReportInput;
    }) =>
      targetType === "post"
        ? communityApi.reportPost(id, input)
        : communityApi.reportComment(id, input),
  });

export const useBlockUser = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, block }: { userId: string; block: boolean }) =>
      communityApi.setBlock(userId, block),
    onSuccess: (_data, { userId }) => {
      void client.invalidateQueries({ queryKey: communityKeys.profile(userId) });
      void client.invalidateQueries({ queryKey: communityKeys.feed() });
    },
  });
};

export const useUploadCommunityImage = () =>
  useMutation({
    mutationFn: (image: ScanImageSource) => communityApi.uploadImage(image),
  });
