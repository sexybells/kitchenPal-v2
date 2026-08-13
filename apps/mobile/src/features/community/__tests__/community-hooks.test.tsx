import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { InfiniteData } from "@tanstack/react-query";
import type { CommunityPostResponse } from "@kitchenpal/api-contract";
import { communityApi, type PostPage } from "../../../api/community";
import { communityKeys, useCommunityFeed, useToggleLike } from "../hooks";

jest.mock("../../../api/community", () => ({
  communityApi: { setLike: jest.fn(), feed: jest.fn(), userPosts: jest.fn() },
}));

const mockedSetLike = communityApi.setLike as jest.MockedFunction<
  typeof communityApi.setLike
>;
const mockedFeed = communityApi.feed as jest.MockedFunction<
  typeof communityApi.feed
>;

const makePost = (over: Partial<CommunityPostResponse> = {}): CommunityPostResponse => ({
  id: "p1",
  authorId: "u1",
  authorName: "Mai",
  authorAvatarUrl: null,
  caption: "Bún bò Huế",
  images: [],
  recipeId: null,
  recipeTitle: null,
  likeCount: 0,
  commentCount: 0,
  likedByMe: false,
  isOwner: false,
  createdAt: "2026-08-09T10:00:00.000Z",
  ...over,
});

const makeClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

const wrapperFor = (client: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };

const seedFeed = (client: QueryClient, post: CommunityPostResponse) => {
  const data: InfiniteData<PostPage> = {
    pages: [{ items: [post], nextCursor: null }],
    pageParams: [undefined],
  };
  client.setQueryData(communityKeys.feed(), data);
};

const cachedPost = (client: QueryClient): CommunityPostResponse | undefined =>
  client.getQueryData<InfiniteData<PostPage>>(communityKeys.feed())?.pages[0]
    ?.items[0];

describe("useToggleLike (optimistic)", () => {
  it("flips like state immediately then rolls back on error", async () => {
    let rejectLike: (reason: unknown) => void = () => {};
    mockedSetLike
      .mockReset()
      .mockImplementation(() => new Promise((_resolve, reject) => {
        rejectLike = reject;
      }));

    const client = makeClient();
    seedFeed(client, makePost({ likeCount: 3 }));

    const { result, unmount } = await renderHook(() => useToggleLike(), {
      wrapper: wrapperFor(client),
    });

    result.current.mutate({ id: "p1", like: true });

    // Optimistic: liked + count bumped before the request resolves.
    await waitFor(() => {
      expect(cachedPost(client)?.likedByMe).toBe(true);
      expect(cachedPost(client)?.likeCount).toBe(4);
    });

    rejectLike(new Error("boom"));

    // Rolled back to the snapshot after the failure.
    await waitFor(() => {
      expect(cachedPost(client)?.likedByMe).toBe(false);
      expect(cachedPost(client)?.likeCount).toBe(3);
    });
    // Let the mutation fully settle, then tear down so no work leaks onward.
    await waitFor(() => expect(result.current.isError).toBe(true));
    unmount();
    client.clear();
  });
});

describe("useCommunityFeed pagination", () => {
  it("appends the next cursor page onto the feed", async () => {
    mockedFeed
      .mockReset()
      .mockResolvedValueOnce({ items: [makePost({ id: "p1" })], nextCursor: "c1" })
      .mockResolvedValueOnce({ items: [makePost({ id: "p2" })], nextCursor: null });

    const client = makeClient();
    const { result } = await renderHook(() => useCommunityFeed(), {
      wrapper: wrapperFor(client),
    });

    await waitFor(() => expect(result.current?.isSuccess).toBe(true));
    expect(result.current?.data?.pages).toHaveLength(1);
    expect(result.current?.hasNextPage).toBe(true);

    await act(async () => {
      await result.current.fetchNextPage();
    });

    await waitFor(() =>
      expect(result.current?.data?.pages).toHaveLength(2),
    );
    const ids =
      result.current?.data?.pages.flatMap((page) => page.items.map((p) => p.id)) ??
      [];
    expect(ids).toEqual(["p1", "p2"]);
    expect(result.current?.hasNextPage).toBe(false);
    expect(mockedFeed).toHaveBeenNthCalledWith(2, { cursor: "c1" });
  });
});
