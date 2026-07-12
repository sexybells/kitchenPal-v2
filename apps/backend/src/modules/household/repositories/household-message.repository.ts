import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { HydratedDocument, Model } from "mongoose";
import { BaseRepository } from "../../../common/database/base.repository";
import type { BaseDocumentFields } from "../../../common/database/base.schema";
import { HouseholdMessage } from "../schemas/household-message.schema";

export type HouseholdMessageEntity = HouseholdMessage & BaseDocumentFields;

type MessageDoc = HydratedDocument<HouseholdMessageEntity>;

/** Data access for household chat messages (always scoped by householdId). */
@Injectable()
export class HouseholdMessageRepository extends BaseRepository<HouseholdMessageEntity> {
  constructor(
    @InjectModel(HouseholdMessage.name) model: Model<HouseholdMessageEntity>,
  ) {
    super(model);
  }

  /** One message, only when it belongs to the given household. */
  findInHousehold(
    householdId: string,
    id: string,
  ): Promise<MessageDoc | null> {
    return this.findOne({ _id: id, householdId });
  }

  /**
   * A page of a household's messages (newest first) plus the total count.
   * `skip` is derived from the opaque cursor by the service.
   */
  async page(
    householdId: string,
    skip: number,
    limit: number,
  ): Promise<{ items: MessageDoc[]; total: number }> {
    const filter = { householdId, deletedAt: null };
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

  /** Adds a reader to a set of the household's messages (idempotent). */
  async markRead(
    householdId: string,
    messageIds: string[],
    userId: string,
  ): Promise<void> {
    await this.model
      .updateMany(
        { _id: { $in: messageIds }, householdId, deletedAt: null },
        { $addToSet: { readByUserIds: userId } },
      )
      .exec();
  }

  /**
   * Replaces the user's ballot on a vote message: drops any prior ballot then
   * records the new one, so each member holds exactly one vote. Two atomic steps
   * keep a re-vote from ever leaving two ballots for the same user.
   */
  async setBallot(
    householdId: string,
    messageId: string,
    userId: string,
    optionId: string,
  ): Promise<MessageDoc | null> {
    const filter = {
      _id: messageId,
      householdId,
      type: "vote",
      deletedAt: null,
    };
    await this.model
      .updateOne(filter, { $pull: { "vote.ballots": { userId } } })
      .exec();
    await this.model
      .updateOne(filter, { $push: { "vote.ballots": { userId, optionId } } })
      .exec();
    return this.model.findOne(filter).exec();
  }
}
