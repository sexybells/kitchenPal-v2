import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import type {
  CreateHouseholdInput,
  CreateInviteInput,
  HouseholdInviteResponse,
  HouseholdJoinResult,
  HouseholdMemberResponse,
  HouseholdResponse,
  UpdateHouseholdInput,
  UpdateMemberInput,
} from "@kitchenpal/api-contract";
import type { HydratedDocument } from "mongoose";
import { ErrorCode } from "../../../common/http/error-codes";
import { UserEntity, UserRepository } from "../../auth/repositories/user.repository";
import { generateOpaqueToken } from "../../auth/services/secret-token";
import { TokenService, toTokenSubject } from "../../auth/services/token.service";
import {
  HouseholdEntity,
  HouseholdRepository,
} from "../repositories/household.repository";
import {
  HouseholdInviteEntity,
  HouseholdInviteRepository,
} from "../repositories/household-invite.repository";
import {
  HouseholdMemberEntity,
  HouseholdMemberRepository,
} from "../repositories/household-member.repository";
import { MembershipService } from "./membership.service";
import { NotificationService } from "./notification.service";
import { RealtimeEmitter } from "../realtime/realtime-emitter";

type HouseholdDoc = HydratedDocument<HouseholdEntity>;
type MemberDoc = HydratedDocument<HouseholdMemberEntity>;
type InviteDoc = HydratedDocument<HouseholdInviteEntity>;
type UserDoc = HydratedDocument<UserEntity>;

const HOUR_MS = 60 * 60 * 1000;

/**
 * Household lifecycle: creation, membership, and invites. Creating a household
 * makes the caller its owner; joining is possible ONLY by accepting an invite
 * code (unguessable, single-use, expiring). Management actions run through
 * {@link MembershipService} role checks so authority is enforced in one place.
 */
@Injectable()
export class HouseholdService {
  constructor(
    private readonly households: HouseholdRepository,
    private readonly members: HouseholdMemberRepository,
    private readonly invites: HouseholdInviteRepository,
    private readonly membership: MembershipService,
    private readonly users: UserRepository,
    private readonly notifications: NotificationService,
    private readonly realtime: RealtimeEmitter,
    private readonly tokens: TokenService,
  ) {}

  async create(
    userId: string,
    input: CreateHouseholdInput,
  ): Promise<HouseholdJoinResult> {
    const household = await this.households.create(
      { name: input.name, ownerUserId: userId, membersCount: 1 } as unknown as Partial<HouseholdEntity>,
      userId,
    );
    await this.members.create(
      {
        householdId: household.id,
        userId,
        role: "owner",
        status: "active",
      } as unknown as Partial<HouseholdMemberEntity>,
      userId,
    );
    // Make the new household the caller's active context and hand back fresh
    // tokens carrying it, so the client acts in household scope immediately.
    await this.setActiveHouseholdIfUnset(userId, household.id, true);
    return this.joinResult(userId, household, "owner");
  }

  async list(userId: string): Promise<HouseholdResponse[]> {
    const memberships = await this.members.listActiveForUser(userId);
    const households = await Promise.all(
      memberships.map((member) =>
        this.households
          .findById(member.householdId.toString())
          .then((household) =>
            household ? toHouseholdResponse(household, member.role) : null,
          ),
      ),
    );
    return households.filter((h): h is HouseholdResponse => h !== null);
  }

  async get(householdId: string, userId: string): Promise<HouseholdResponse> {
    const member = await this.membership.requireActiveMember(householdId, userId);
    const household = await this.requireHousehold(householdId);
    return toHouseholdResponse(household, member.role);
  }

  async update(
    householdId: string,
    userId: string,
    input: UpdateHouseholdInput,
  ): Promise<HouseholdResponse> {
    const member = await this.membership.requireManager(householdId, userId);
    const household = await this.requireHousehold(householdId);
    const updated = await this.households.updateWithVersion(
      household.id,
      household.version,
      { name: input.name },
      userId,
    );
    return toHouseholdResponse(updated, member.role);
  }

  async remove(householdId: string, userId: string): Promise<void> {
    const member = await this.membership.requireActiveMember(householdId, userId);
    if (member.role !== "owner") {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: "Only the owner may delete a household",
      });
    }
    const actives = await this.members.listActiveMembers(householdId);
    await Promise.all(
      actives.map((row) =>
        this.members.updateWithVersion(
          row.id,
          row.version,
          { status: "removed" },
          userId,
        ),
      ),
    );
    await this.households.softDelete(householdId, userId);
    await this.households.adjustMembersCount(householdId, -actives.length);
    // Detach anyone whose active context was this household, and evict their live
    // sockets from the room so a still-open socket stops receiving broadcasts.
    await Promise.all(
      actives.map((row) =>
        this.clearActiveHousehold(row.userId.toString(), householdId),
      ),
    );
    for (const row of actives) {
      this.realtime.evictUserFromHousehold(row.userId.toString(), householdId);
    }
  }

  async listMembers(
    householdId: string,
    userId: string,
  ): Promise<HouseholdMemberResponse[]> {
    await this.membership.requireActiveMember(householdId, userId);
    const members = await this.members.listActiveMembers(householdId);
    const userMap = await this.loadUsers(members.map((m) => m.userId.toString()));
    return members.map((member) => toMemberResponse(member, userMap));
  }

  async updateMemberRole(
    householdId: string,
    actorId: string,
    memberId: string,
    input: UpdateMemberInput,
  ): Promise<HouseholdMemberResponse> {
    const actor = await this.membership.requireManager(householdId, actorId);
    const target = await this.requireMember(householdId, memberId);
    if (target.role === "owner") {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: "The owner role cannot be changed",
      });
    }
    // A manager may only act on strictly lower-ranked members (an admin cannot
    // re-role another admin; only the owner can).
    if (!this.membership.outranks(actor.role, target.role)) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: "You cannot change a member at or above your own role",
      });
    }
    const updated = await this.members.updateWithVersion(
      target.id,
      target.version,
      { role: input.role },
      actorId,
    );
    const userMap = await this.loadUsers([updated.userId.toString()]);
    return toMemberResponse(updated, userMap);
  }

  async removeMember(
    householdId: string,
    actorId: string,
    memberId: string,
  ): Promise<void> {
    const target = await this.requireMember(householdId, memberId);
    const isSelfLeave = target.userId.toString() === actorId;
    if (target.role === "owner") {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: "The owner cannot be removed; delete the household instead",
      });
    }
    if (!isSelfLeave) {
      const actor = await this.membership.requireManager(householdId, actorId);
      if (!this.membership.outranks(actor.role, target.role)) {
        throw new ForbiddenException({
          code: ErrorCode.FORBIDDEN,
          message: "You cannot remove a member at or above your own role",
        });
      }
    } else {
      // A self-leave still requires being an active member of the household.
      await this.membership.requireActiveMember(householdId, actorId);
    }
    await this.members.updateWithVersion(
      target.id,
      target.version,
      { status: "removed" },
      actorId,
    );
    await this.households.adjustMembersCount(householdId, -1);
    const removedUserId = target.userId.toString();
    await this.clearActiveHousehold(removedUserId, householdId);
    // Evict the removed user's live sockets from the room so a still-open socket
    // stops receiving this household's broadcasts (other households untouched).
    this.realtime.evictUserFromHousehold(removedUserId, householdId);
  }

  async createInvite(
    householdId: string,
    userId: string,
    input: CreateInviteInput,
  ): Promise<HouseholdInviteResponse> {
    await this.membership.requireManager(householdId, userId);
    await this.requireHousehold(householdId);
    const invite = await this.invites.create(
      {
        householdId,
        code: generateOpaqueToken(),
        status: "pending",
        expiresAt: new Date(Date.now() + input.ttlHours * HOUR_MS),
        invitedBy: userId,
        acceptedBy: null,
      } as unknown as Partial<HouseholdInviteEntity>,
      userId,
    );
    return toInviteResponse(invite);
  }

  async listInvites(
    householdId: string,
    userId: string,
  ): Promise<HouseholdInviteResponse[]> {
    await this.membership.requireManager(householdId, userId);
    const invites = await this.invites.listPending(householdId);
    return invites.map(toInviteResponse);
  }

  async revokeInvite(
    householdId: string,
    userId: string,
    inviteId: string,
  ): Promise<void> {
    await this.membership.requireManager(householdId, userId);
    const invite = await this.invites.findById(inviteId);
    if (!invite || invite.householdId.toString() !== householdId) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: "Invite not found",
        details: { inviteId },
      });
    }
    if (invite.status === "pending") {
      await this.invites.updateWithVersion(
        invite.id,
        invite.version,
        { status: "revoked" },
        userId,
      );
    }
  }

  /**
   * Accepts an invite code and joins the household. The claim is atomic, so a
   * concurrent double-accept can never add two seats. Accepting is the only path
   * to membership.
   */
  async acceptInvite(
    userId: string,
    code: string,
  ): Promise<HouseholdJoinResult> {
    // Short-circuit an already-active member BEFORE claiming, so redeeming a code
    // you don't need does not burn the single-use invite for someone else.
    const peek = await this.invites.findByCode(code);
    if (peek) {
      const current = await this.members.findMembership(
        peek.householdId.toString(),
        userId,
      );
      if (current && current.status === "active") {
        const household = await this.requireHousehold(
          peek.householdId.toString(),
        );
        return this.joinResult(userId, household, current.role);
      }
    }

    const invite = await this.invites.claim(code, userId, new Date());
    if (!invite) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: "This invite code is invalid, expired, or already used",
      });
    }
    const householdId = invite.householdId.toString();
    await this.requireHousehold(householdId);

    // Re-read membership after the atomic claim (a concurrent request could have
    // reactivated a removed seat in the meantime).
    const existing = await this.members.findMembership(householdId, userId);
    if (existing && existing.status === "active") {
      const household = await this.requireHousehold(householdId);
      return this.joinResult(userId, household, existing.role);
    }
    if (existing) {
      await this.members.updateWithVersion(
        existing.id,
        existing.version,
        { status: "active", role: "member" },
        userId,
      );
    } else {
      await this.members.create(
        {
          householdId,
          userId,
          role: "member",
          status: "active",
        } as unknown as Partial<HouseholdMemberEntity>,
        userId,
      );
    }
    await this.households.adjustMembersCount(householdId, 1);
    await this.setActiveHouseholdIfUnset(userId, householdId, false);

    // Tell the inviter their invite was accepted.
    await this.notifications.notify(invite.invitedBy.toString(), {
      type: "invite_accepted",
      payload: { householdId, userId },
      delivery: {
        push: { title: "Invite accepted", body: "A member joined your household" },
      },
    });
    // Re-read so the response reflects the just-incremented member count.
    const household = await this.requireHousehold(householdId);
    return this.joinResult(userId, household, "member");
  }

  /**
   * Builds a join result: the household response plus a fresh token pair. The
   * user is re-read so the signed access token carries the up-to-date
   * `activeHouseholdId`, letting the client enter household scope with no
   * re-login. A new refresh family is minted (the old one stays valid until it
   * expires or is rotated), mirroring how sign-in issues tokens.
   */
  private async joinResult(
    userId: string,
    household: HouseholdDoc,
    role: HouseholdMemberEntity["role"],
  ): Promise<HouseholdJoinResult> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: "Account no longer exists",
      });
    }
    // Suspension gate — this is a token-minting path (create/accept-invite issue
    // a fresh refresh family). Without this, a suspended user holding a still-
    // valid access token could mint a brand-new, rotatable family here and defeat
    // the ban that admin suspension enforces via revokeAllForUser. Mirrors
    // AuthService.buildResult so EVERY mint path rejects a suspended account.
    if (user.suspendedAt) {
      throw new UnauthorizedException({
        code: ErrorCode.ACCOUNT_SUSPENDED,
        message: "This account has been suspended",
      });
    }
    const tokens = await this.tokens.issueTokenPair(toTokenSubject(user));
    return { ...toHouseholdResponse(household, role), tokens };
  }

  private async requireHousehold(householdId: string): Promise<HouseholdDoc> {
    const household = await this.households.findById(householdId);
    if (!household) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: "Household not found",
        details: { householdId },
      });
    }
    return household;
  }

  private async requireMember(
    householdId: string,
    memberId: string,
  ): Promise<MemberDoc> {
    const member = await this.members.findById(memberId);
    if (
      !member ||
      member.householdId.toString() !== householdId ||
      member.status !== "active"
    ) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: "Member not found",
        details: { memberId },
      });
    }
    return member;
  }

  private async loadUsers(userIds: string[]): Promise<Map<string, UserDoc>> {
    const unique = Array.from(new Set(userIds));
    const users = await Promise.all(unique.map((id) => this.users.findById(id)));
    const map = new Map<string, UserDoc>();
    for (const user of users) {
      if (user) {
        map.set(user.id, user);
      }
    }
    return map;
  }

  private async setActiveHouseholdIfUnset(
    userId: string,
    householdId: string,
    force: boolean,
  ): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user) {
      return;
    }
    if (force || !user.activeHouseholdId) {
      await this.users.updateWithVersion(
        user.id,
        user.version,
        { activeHouseholdId: householdId },
        user.id,
      );
    }
  }

  private async clearActiveHousehold(
    userId: string,
    householdId: string,
  ): Promise<void> {
    const user = await this.users.findById(userId);
    if (user && user.activeHouseholdId?.toString() === householdId) {
      await this.users.updateWithVersion(
        user.id,
        user.version,
        { activeHouseholdId: null },
        user.id,
      );
    }
  }
}

function toHouseholdResponse(
  doc: HouseholdDoc,
  myRole: HouseholdMemberEntity["role"],
): HouseholdResponse {
  return {
    id: doc.id,
    name: doc.name,
    ownerUserId: doc.ownerUserId.toString(),
    membersCount: doc.membersCount,
    myRole,
    version: doc.version,
    createdAt: (doc.createdAt ?? new Date()).toISOString(),
    updatedAt: (doc.updatedAt ?? new Date()).toISOString(),
  };
}

function toMemberResponse(
  doc: MemberDoc,
  userMap: Map<string, UserDoc>,
): HouseholdMemberResponse {
  const user = userMap.get(doc.userId.toString());
  return {
    id: doc.id,
    householdId: doc.householdId.toString(),
    userId: doc.userId.toString(),
    role: doc.role,
    status: doc.status,
    displayName: user?.displayName ?? "Unknown",
    avatarUrl: user?.avatarUrl ?? null,
    createdAt: (doc.createdAt ?? new Date()).toISOString(),
    updatedAt: (doc.updatedAt ?? new Date()).toISOString(),
  };
}

function toInviteResponse(doc: InviteDoc): HouseholdInviteResponse {
  return {
    id: doc.id,
    householdId: doc.householdId.toString(),
    code: doc.code,
    status: doc.status,
    expiresAt: doc.expiresAt.toISOString(),
    invitedBy: doc.invitedBy.toString(),
    createdAt: (doc.createdAt ?? new Date()).toISOString(),
  };
}
