import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { FilterQuery, HydratedDocument, Model } from "mongoose";
import { Types } from "mongoose";
import { BaseRepository } from "../../../common/database/base.repository";
import type { BaseDocumentFields } from "../../../common/database/base.schema";
import { CommunityUserBlock } from "../schemas/community-user-block.schema";

export type CommunityUserBlockEntity = CommunityUserBlock & BaseDocumentFields;

type BlockDoc = HydratedDocument<CommunityUserBlockEntity>;

/**
 * Store for user blocks. The blocker is `createdBy`, the target is
 * `blockedUserId`. Reads drive the feed's block-exclusion filter.
 */
@Injectable()
export class CommunityUserBlockRepository extends BaseRepository<CommunityUserBlockEntity> {
  constructor(
    @InjectModel(CommunityUserBlock.name)
    model: Model<CommunityUserBlockEntity>,
  ) {
    super(model);
  }

  /** The caller's live block on a specific user, if any. */
  findLive(blockerId: string, blockedUserId: string): Promise<BlockDoc | null> {
    return this.findOne({
      createdBy: new Types.ObjectId(blockerId),
      blockedUserId: new Types.ObjectId(blockedUserId),
    } as FilterQuery<CommunityUserBlockEntity>);
  }

  /** Every user id the caller currently blocks (drives the feed exclusion). */
  async blockedUserIds(blockerId: string): Promise<string[]> {
    const rows = await this.model
      .find({ createdBy: new Types.ObjectId(blockerId), deletedAt: null })
      .select("blockedUserId")
      .exec();
    return rows.map((row) => row.blockedUserId.toString());
  }

  /**
   * Atomically soft-deletes the caller's live block on a user (unblock). Returns
   * the removed doc, or null when there was no live block — so unblock is
   * idempotent.
   */
  softDeleteLive(
    blockerId: string,
    blockedUserId: string,
  ): Promise<BlockDoc | null> {
    return this.model
      .findOneAndUpdate(
        {
          createdBy: new Types.ObjectId(blockerId),
          blockedUserId: new Types.ObjectId(blockedUserId),
          deletedAt: null,
        },
        { $set: { deletedAt: new Date(), updatedBy: blockerId }, $inc: { version: 1 } },
        { new: true },
      )
      .exec();
  }
}
