import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { FilterQuery, HydratedDocument, Model } from "mongoose";
import { Types } from "mongoose";
import { BaseRepository } from "../../../common/database/base.repository";
import type { BaseDocumentFields } from "../../../common/database/base.schema";
import { CommunityPostComment } from "../schemas/community-post-comment.schema";

export type CommunityCommentEntity = CommunityPostComment & BaseDocumentFields;

type CommentDoc = HydratedDocument<CommunityCommentEntity>;

/** Store for flat post comments. The author is `createdBy`. */
@Injectable()
export class CommunityCommentRepository extends BaseRepository<CommunityCommentEntity> {
  constructor(
    @InjectModel(CommunityPostComment.name)
    model: Model<CommunityCommentEntity>,
  ) {
    super(model);
  }

  /** One page of a post's comments (newest first) plus the total count. */
  async listByPost(
    postId: string,
    skip: number,
    limit: number,
  ): Promise<{ items: CommentDoc[]; total: number }> {
    const filter: FilterQuery<CommunityCommentEntity> = {
      postId: new Types.ObjectId(postId),
      deletedAt: null,
    };
    const [items, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.model.countDocuments(filter).exec(),
    ]);
    return { items, total };
  }

  /**
   * Atomically soft-deletes a comment the caller authored. Returns the removed
   * doc, or null when it does not exist or belongs to another user — so the
   * caller can distinguish an author-only rejection from a real delete and the
   * post's comment counter is decremented exactly once.
   */
  softDeleteOwn(id: string, userId: string): Promise<CommentDoc | null> {
    return this.model
      .findOneAndUpdate(
        { _id: id, createdBy: new Types.ObjectId(userId), deletedAt: null },
        { $set: { deletedAt: new Date(), updatedBy: userId }, $inc: { version: 1 } },
        { new: true },
      )
      .exec();
  }
}
