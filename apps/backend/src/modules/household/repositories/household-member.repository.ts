import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { HydratedDocument, Model } from "mongoose";
import { BaseRepository } from "../../../common/database/base.repository";
import type { BaseDocumentFields } from "../../../common/database/base.schema";
import { HouseholdMember } from "../schemas/household-member.schema";

export type HouseholdMemberEntity = HouseholdMember & BaseDocumentFields;

type MemberDoc = HydratedDocument<HouseholdMemberEntity>;

/** Data access for the membership edges between users and households. */
@Injectable()
export class HouseholdMemberRepository extends BaseRepository<HouseholdMemberEntity> {
  constructor(
    @InjectModel(HouseholdMember.name) model: Model<HouseholdMemberEntity>,
  ) {
    super(model);
  }

  /** The membership row for a (household, user) pair regardless of status. */
  findMembership(
    householdId: string,
    userId: string,
  ): Promise<MemberDoc | null> {
    return this.findOne({ householdId, userId });
  }

  /** The row only when the user is a current ACTIVE member. */
  findActiveMembership(
    householdId: string,
    userId: string,
  ): Promise<MemberDoc | null> {
    return this.findOne({ householdId, userId, status: "active" });
  }

  /** Whether the user is a current active member of the household. */
  async isActiveMember(householdId: string, userId: string): Promise<boolean> {
    const count = await this.count({ householdId, userId, status: "active" });
    return count > 0;
  }

  /** All active members of a household (for the members list and fanout). */
  listActiveMembers(householdId: string): Promise<MemberDoc[]> {
    return this.model
      .find({ householdId, status: "active", deletedAt: null })
      .sort({ createdAt: 1 })
      .exec();
  }

  /** Active member user ids (for chat/notification fanout targeting). */
  async activeMemberIds(householdId: string): Promise<string[]> {
    const rows = await this.model
      .find({ householdId, status: "active", deletedAt: null }, { userId: 1 })
      .exec();
    return rows.map((row) => row.userId.toString());
  }

  /** Households the user is an active member of (for the household list). */
  listActiveForUser(userId: string): Promise<MemberDoc[]> {
    return this.model
      .find({ userId, status: "active", deletedAt: null })
      .sort({ createdAt: 1 })
      .exec();
  }
}
