import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { notifyManager } from "@tanstack/react-query";
import type { CommunityPostResponse } from "@kitchenpal/api-contract";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";
import { communityApi } from "../../../api/community";
import { PostCard } from "../PostCard";

// Flush TanStack Query notifications synchronously so a batched setTimeout from
// one test can't fire mid-render of another under the React 19 act environment.
notifyManager.setScheduler((cb) => cb());

// The `src/ui` barrel pulls in BottomNav (expo-router); mock it so the suite
// doesn't load expo-router's untransformed ESM tree.
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock("../../../api/community", () => ({
  communityApi: {
    setLike: jest.fn(),
    setBlock: jest.fn(),
    deletePost: jest.fn(),
    reportPost: jest.fn(),
  },
}));

const mockedSetLike = communityApi.setLike as jest.MockedFunction<
  typeof communityApi.setLike
>;

const post: CommunityPostResponse = {
  id: "p1",
  authorId: "u1",
  authorName: "Mai Lan",
  authorAvatarUrl: null,
  caption: "Phở gà nhà làm",
  images: [],
  recipeId: "r1",
  recipeTitle: "Phở gà",
  likeCount: 5,
  commentCount: 2,
  likedByMe: false,
  isOwner: false,
  createdAt: "2026-08-09T10:00:00.000Z",
};

describe("PostCard", () => {
  beforeEach(() => {
    mockedSetLike
      .mockReset()
      .mockResolvedValue({ postId: "p1", likedByMe: true, likeCount: 6 });
  });

  it("sends a like when the heart is pressed", async () => {
    const view = await renderWithProviders(
      <PostCard
        post={post}
        onOpenProfile={jest.fn()}
        onOpenRecipe={jest.fn()}
        onOpenComments={jest.fn()}
        testID="post-card-p1"
      />,
    );

    fireEvent.press(view.getByTestId("post-card-p1-like"));
    await waitFor(() => expect(mockedSetLike).toHaveBeenCalledWith("p1", true));
  });

  it("renders the author, caption, recipe chip and counts", async () => {
    await renderWithProviders(
      <PostCard
        post={post}
        onOpenProfile={jest.fn()}
        onOpenRecipe={jest.fn()}
        onOpenComments={jest.fn()}
        testID="post-card-p1"
      />,
    );

    expect(screen.getByText("Mai Lan")).toBeTruthy();
    expect(screen.getByText("Phở gà nhà làm")).toBeTruthy();
    expect(screen.getByText("Phở gà")).toBeTruthy();
    // Like + comment counts render from the post.
    expect(screen.getByText("5")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
  });

  it("routes taps to profile, recipe and comments", async () => {
    const onOpenProfile = jest.fn();
    const onOpenRecipe = jest.fn();
    const onOpenComments = jest.fn();
    await renderWithProviders(
      <PostCard
        post={post}
        onOpenProfile={onOpenProfile}
        onOpenRecipe={onOpenRecipe}
        onOpenComments={onOpenComments}
        testID="post-card-p1"
      />,
    );

    fireEvent.press(screen.getByTestId("post-card-p1-author"));
    expect(onOpenProfile).toHaveBeenCalledWith("u1");

    fireEvent.press(screen.getByTestId("post-card-p1-recipe"));
    expect(onOpenRecipe).toHaveBeenCalledWith("r1");

    fireEvent.press(screen.getByTestId("post-card-p1-comments"));
    expect(onOpenComments).toHaveBeenCalledWith("p1");
  });
});
