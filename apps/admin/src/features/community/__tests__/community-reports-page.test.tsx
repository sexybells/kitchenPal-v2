import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AdminCommunityReportResponse } from "@kitchenpal/api-contract";
import type { Page } from "@/api/client";
import { renderWithProviders } from "@/test-utils/render";

const listCommunityReports =
  vi.fn<() => Promise<Page<AdminCommunityReportResponse>>>();
const removeCommunityPost = vi.fn();
const removeCommunityComment = vi.fn();
const dismissCommunityReport = vi.fn();

vi.mock("@/api/admin", () => ({
  adminApi: {
    listCommunityReports: () => listCommunityReports(),
    removeCommunityPost: (id: string) => removeCommunityPost(id),
    removeCommunityComment: (id: string) => removeCommunityComment(id),
    dismissCommunityReport: (id: string) => dismissCommunityReport(id),
  },
}));

import { CommunityReportsPage } from "../community-reports-page";

const postReport: AdminCommunityReportResponse = {
  id: "r1",
  targetType: "post",
  targetId: "p1",
  reason: "spam",
  detail: "Bán hàng",
  status: "open",
  reporterName: "Anh Reporter",
  targetPreview: "Nội dung bài viết",
  targetAuthorName: "Tác giả",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const commentReport: AdminCommunityReportResponse = {
  ...postReport,
  id: "r2",
  targetType: "comment",
  targetId: "c1",
  reason: "harassment",
  detail: null,
  reporterName: "Chị Reporter",
  targetPreview: "Bình luận xấu",
};

function pageOf(items: AdminCommunityReportResponse[]): Page<AdminCommunityReportResponse> {
  return { items, page: { nextCursor: null, hasMore: false } };
}

beforeEach(() => {
  removeCommunityPost.mockResolvedValue({});
  removeCommunityComment.mockResolvedValue({});
  dismissCommunityReport.mockResolvedValue({});
});

afterEach(() => {
  vi.restoreAllMocks();
  listCommunityReports.mockReset();
  removeCommunityPost.mockReset();
  removeCommunityComment.mockReset();
  dismissCommunityReport.mockReset();
});

describe("CommunityReportsPage", () => {
  it("lists reports returned by the admin endpoint", async () => {
    listCommunityReports.mockResolvedValue(pageOf([postReport, commentReport]));

    renderWithProviders(<CommunityReportsPage />);

    expect(await screen.findByText("Nội dung bài viết")).toBeInTheDocument();
    expect(screen.getByText("Bình luận xấu")).toBeInTheDocument();
    expect(screen.getByText("Anh Reporter")).toBeInTheDocument();
  });

  it("removes a reported post via the post-remove endpoint using targetId", async () => {
    listCommunityReports.mockResolvedValue(pageOf([postReport]));
    vi.spyOn(window, "confirm").mockReturnValue(true);

    renderWithProviders(<CommunityReportsPage />);
    const row = (await screen.findByText("Nội dung bài viết")).closest("tr")!;
    await userEvent.click(
      within(row).getByRole("button", { name: "Gỡ nội dung" }),
    );

    await waitFor(() => {
      expect(removeCommunityPost).toHaveBeenCalledWith("p1");
    });
    expect(removeCommunityComment).not.toHaveBeenCalled();
  });

  it("routes comment removal to the comment-remove endpoint", async () => {
    listCommunityReports.mockResolvedValue(pageOf([commentReport]));
    vi.spyOn(window, "confirm").mockReturnValue(true);

    renderWithProviders(<CommunityReportsPage />);
    const row = (await screen.findByText("Bình luận xấu")).closest("tr")!;
    await userEvent.click(
      within(row).getByRole("button", { name: "Gỡ nội dung" }),
    );

    await waitFor(() => {
      expect(removeCommunityComment).toHaveBeenCalledWith("c1");
    });
    expect(removeCommunityPost).not.toHaveBeenCalled();
  });

  it("dismisses a report via the dismiss endpoint using the report id", async () => {
    listCommunityReports.mockResolvedValue(pageOf([postReport]));
    vi.spyOn(window, "confirm").mockReturnValue(true);

    renderWithProviders(<CommunityReportsPage />);
    const row = (await screen.findByText("Nội dung bài viết")).closest("tr")!;
    await userEvent.click(within(row).getByRole("button", { name: "Bỏ qua" }));

    await waitFor(() => {
      expect(dismissCommunityReport).toHaveBeenCalledWith("r1");
    });
  });

  it("does not remove when the confirmation is dismissed", async () => {
    listCommunityReports.mockResolvedValue(pageOf([postReport]));
    vi.spyOn(window, "confirm").mockReturnValue(false);

    renderWithProviders(<CommunityReportsPage />);
    const row = (await screen.findByText("Nội dung bài viết")).closest("tr")!;
    await userEvent.click(
      within(row).getByRole("button", { name: "Gỡ nội dung" }),
    );

    expect(removeCommunityPost).not.toHaveBeenCalled();
  });
});
