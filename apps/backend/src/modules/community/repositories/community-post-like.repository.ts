import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { FilterQuery, HydratedDocument, Model } from "mongoose";
import { Types } from "mongoose";
import { BaseRepository } from "../../../common/database/base.repository";
import type { BaseDocumentFields } from "../../../common/database/base.schema";
import { CommunityPostLike } from "../schemas/community-post-like.schema";

export type CommunityPostLikeEntity = CommunityPostLike & BaseDocumentFields;

type LikeDoc = HydratedDocument<CommunityPostLikeEntity>;

/**
 * Store for post likes. The liker is `createdBy`; a partial-unique index on live
 * rows enforces one like per user per post, so the like/unlike flow stays
 * idempotent and the post's counter cannot drift.
 */
@Injectable()
export class CommunityPostLikeRepository extends BaseRepository<CommunityPostLikeEntity> {
  constructor(
    @InjectModel(CommunityPostLike.name) model: Model<CommunityPostLikeEntity>,
  ) {
    super(model);
  }

  /** The caller's live like on a post, if any. */
  findLive(postId: string, userId: string): Promise<LikeDoc | null> {
    return this.findOne({
      postId: new Types.ObjectId(postId),
      createdBy: new Types.ObjectId(userId),
    } as FilterQuery<CommunityPostLikeEntity>);
  }

  /**
   * Atomically soft-deletes the caller's live like on a post. Returns the
   * removed doc, or null when there was no live like — so exactly one concurrent
   * unlike wins and drives a single counter decrement.
   */
  softDeleteLive(postId: string, userId: string): Promise<LikeDoc | null> {
    return this.model
      .findOneAndUpdate(
        {
          postId: new Types.ObjectId(postId),
          createdBy: new Types.ObjectId(userId),
          deletedAt: null,
        },
        { $set: { deletedAt: new Date(), updatedBy: userId }, $inc: { version: 1 } },
        { new: true },
      )
      .exec();
  }

  /** The subset of the given post ids the caller has liked. */
  async likedPostIds(postIds: string[], userId: string): Promise<Set<string>> {
    if (postIds.length === 0) {
      return new Set();
    }
    const rows = await this.model
      .find({
        postId: { $in: postIds.map((id) => new Types.ObjectId(id)) },
        createdBy: new Types.ObjectId(userId),
        deletedAt: null,
      })
      .select("postId")
      .exec();
    return new Set(rows.map((row) => row.postId.toString()));
  }
}
