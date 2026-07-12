import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { HydratedDocument, Model } from "mongoose";
import { BaseRepository } from "../../../common/database/base.repository";
import type { BaseDocumentFields } from "../../../common/database/base.schema";
import { HouseholdInvite } from "../schemas/household-invite.schema";

export type HouseholdInviteEntity = HouseholdInvite & BaseDocumentFields;

type InviteDoc = HydratedDocument<HouseholdInviteEntity>;

/** Data access for household join codes. */
@Injectable()
export class HouseholdInviteRepository extends BaseRepository<HouseholdInviteEntity> {
  constructor(
    @InjectModel(HouseholdInvite.name) model: Model<HouseholdInviteEntity>,
  ) {
    super(model);
  }

  findByCode(code: string): Promise<InviteDoc | null> {
    return this.findOne({ code });
  }

  /** Pending, unexpired invites for a household (newest first). */
  listPending(householdId: string): Promise<InviteDoc[]> {
    return this.model
      .find({ householdId, status: "pending", deletedAt: null })
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Atomically claims a pending, unexpired invite by moving it to `accepted`.
   * Returns the claimed doc, or null if another request already claimed it or it
   * expired — so acceptance can never double-add a member on a race.
   */
  claim(code: string, acceptedBy: string, now: Date): Promise<InviteDoc | null> {
    return this.model
      .findOneAndUpdate(
        {
          code,
          status: "pending",
          deletedAt: null,
          expiresAt: { $gt: now },
        },
        { $set: { status: "accepted", acceptedBy } },
        { new: true },
      )
      .exec();
  }
}
