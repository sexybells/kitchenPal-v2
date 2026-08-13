import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { FilterQuery, HydratedDocument, Model } from "mongoose";
import { Types } from "mongoose";
import { BaseRepository } from "../../../common/database/base.repository";
import type { BaseDocumentFields } from "../../../common/database/base.schema";
import { CommunityPost } from "../schemas/community-post.schema";

export type CommunityPostEntity = CommunityPost & BaseDocumentFields;

type PostDoc = HydratedDocument<CommunityPostEntity>;

/** Filters for one page of the public feed. */
export interface FeedListOptions {
  /** Narrow the feed to a single author (profile screens). */
  authorId?: string;
  /** Author ids the caller has blocked — their posts are excluded. */
  blockedAuthorIds: string[];
  skip: number;
  limit: number;
}

/**
 * Store for community posts. Community content is public/global, so this uses
 * the UNSCOPED {@link BaseRepository} (the author is `createdBy`); the
 * soft-delete exclusion still applies to every read and the derived like/comment
 * counters are bumped directly (no version guard) like `recipe.incrementView`.
 */
@Injectable()
export class CommunityPostRepository extends BaseRepository<CommunityPostEntity> {
  constructor(
    @InjectModel(CommunityPost.name) model: Model<CommunityPostEntity>,
  ) {
    super(model);
  }

  /** One page of the feed (newest first) plus the total matching count. */
  async listFeed(
    options: FeedListOptions,
  ): Promise<{ items: PostDoc[]; total: number }> {
    const filter: FilterQuery<CommunityPostEntity> = { deletedAt: null };
    if (options.authorId) {
      filter.createdBy = new Types.ObjectId(options.authorId);
    } else if (options.blockedAuthorIds.length > 0) {
      // A profile listing already targets one author, so the block filter only
      // matters for the global feed.
      filter.createdBy = {
        $nin: options.blockedAuthorIds.map((id) => new Types.ObjectId(id)),
      };
    }
    const [items, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(options.skip)
        .limit(options.limit)
        .exec(),
      this.model.countDocuments(filter).exec(),
    ]);
    return { items, total };
  }

  /** Number of live posts authored by a user (profile post count). */
  countByAuthor(authorId: string): Promise<number> {
    return this.count({
      createdBy: new Types.ObjectId(authorId),
    } as FilterQuery<CommunityPostEntity>);
  }

  /**
   * Adjusts a post's derived like counter. Monotonic derived state, so it is
   * updated directly without the optimistic-lock guard (a like is not a
   * concurrency-sensitive edit and must not force retries), and clamped at 0.
   */
  async adjustLikeCount(id: string, delta: number): Promise<void> {
    await this.bumpCounter(id, "likeCount", delta);
  }

  /** Adjusts a post's derived comment counter (see {@link adjustLikeCount}). */
  async adjustCommentCount(id: string, delta: number): Promise<void> {
    await this.bumpCounter(id, "commentCount", delta);
  }

  private async bumpCounter(
    id: string,
    field: "likeCount" | "commentCount",
    delta: number,
  ): Promise<void> {
    // Guard the decrement so a counter can never go negative, even if a stale
    // client double-fires an unlike/delete.
    const filter: FilterQuery<CommunityPostEntity> =
      delta < 0
        ? ({ _id: id, [field]: { $gte: -delta } } as FilterQuery<CommunityPostEntity>)
        : ({ _id: id } as FilterQuery<CommunityPostEntity>);
    await this.model.updateOne(filter, { $inc: { [field]: delta } }).exec();
  }
}
