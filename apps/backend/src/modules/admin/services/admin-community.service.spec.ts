import { NotFoundException } from "@nestjs/common";
import { Types } from "mongoose";
import type { UserRepository } from "../../auth/repositories/user.repository";
import type { CommunityCommentRepository } from "../../community/repositories/community-comment.repository";
import type { CommunityPostRepository } from "../../community/repositories/community-post.repository";
import type { CommunityReportRepository } from "../../community/repositories/community-report.repository";
import type { AdminAuditService } from "./admin-audit.service";
import { AdminCommunityService } from "./admin-community.service";

function oid(id: string): Types.ObjectId {
  return { toString: () => id } as unknown as Types.ObjectId;
}

interface Mocks {
  posts: jest.Mocked<CommunityPostRepository>;
  comments: jest.Mocked<CommunityCommentRepository>;
  reports: jest.Mocked<CommunityReportRepository>;
  users: jest.Mocked<UserRepository>;
  audit: jest.Mocked<AdminAuditService>;
}

function build(): { service: AdminCommunityService; mocks: Mocks } {
  const mocks = {
    posts: {
      findById: jest.fn(),
      softDelete: jest.fn(),
      adjustCommentCount: jest.fn(),
    },
    comments: { findById: jest.fn(), softDelete: jest.fn() },
    reports: {
      findById: jest.fn(),
      markOpenReviewed: jest.fn(),
      updateWithVersion: jest.fn(),
    },
    users: { find: jest.fn() },
    audit: { record: jest.fn() },
  } as unknown as Mocks;
  const service = new AdminCommunityService(
    mocks.posts,
    mocks.comments,
    mocks.reports,
    mocks.users,
    mocks.audit,
  );
  return { service, mocks };
}

describe("AdminCommunityService", () => {
  it("removes a post and marks its open reports reviewed", async () => {
    const { service, mocks } = build();
    mocks.posts.findById.mockResolvedValue({ id: "post1" } as never);

    await service.removePost("admin1", "post1");

    expect(mocks.posts.softDelete).toHaveBeenCalledWith("post1", "admin1");
    expect(mocks.reports.markOpenReviewed).toHaveBeenCalledWith("post1");
    expect(mocks.audit.record).toHaveBeenCalled();
  });

  it("removes a comment, fixes the post counter, and reviews its reports", async () => {
    const { service, mocks } = build();
    mocks.comments.findById.mockResolvedValue({
      id: "c1",
      postId: oid("post1"),
    } as never);

    await service.removeComment("admin1", "c1");

    expect(mocks.comments.softDelete).toHaveBeenCalledWith("c1", "admin1");
    expect(mocks.posts.adjustCommentCount).toHaveBeenCalledWith("post1", -1);
    expect(mocks.reports.markOpenReviewed).toHaveBeenCalledWith("c1");
  });

  it("dismisses a report by moving it to the dismissed status", async () => {
    const { service, mocks } = build();
    mocks.reports.findById.mockResolvedValue({
      id: "r1",
      version: 0,
    } as never);
    mocks.reports.updateWithVersion.mockResolvedValue({} as never);

    await service.dismissReport("admin1", "r1");

    expect(mocks.reports.updateWithVersion).toHaveBeenCalledWith(
      "r1",
      0,
      { status: "dismissed" },
      "admin1",
    );
  });

  it("404s when removing a post that does not exist", async () => {
    const { service, mocks } = build();
    mocks.posts.findById.mockResolvedValue(null as never);

    await expect(service.removePost("admin1", "nope")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
