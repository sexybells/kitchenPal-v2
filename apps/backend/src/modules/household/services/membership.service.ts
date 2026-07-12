import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { HouseholdRole } from "@kitchenpal/api-contract";
import type { HydratedDocument } from "mongoose";
import { ErrorCode } from "../../../common/http/error-codes";
import { MembershipVerifier } from "../../../common/scope/membership";
import {
  HouseholdMemberEntity,
  HouseholdMemberRepository,
} from "../repositories/household-member.repository";

type MemberDoc = HydratedDocument<HouseholdMemberEntity>;

/** Ranks roles so a manager can only act on peers/subordinates. */
const ROLE_RANK: Record<HouseholdRole, number> = {
  owner: 3,
  admin: 2,
  member: 1,
};

/**
 * The single source of truth for "may this user act in this household?".
 * Implements {@link MembershipVerifier} so the global scope guard resolves
 * household scope through the exact same active-membership check used by every
 * household/chat route — there is no second, divergent notion of membership.
 */
@Injectable()
export class MembershipService extends MembershipVerifier {
  constructor(private readonly members: HouseholdMemberRepository) {
    super();
  }

  /** {@link MembershipVerifier} contract used by the scope guard. */
  isActiveMember(userId: string, householdId: string): Promise<boolean> {
    return this.members.isActiveMember(householdId, userId);
  }

  /**
   * Loads the caller's active membership or fails closed. A non-member gets a 404
   * (not a 403) so household existence is not revealed to outsiders.
   */
  async requireActiveMember(
    householdId: string,
    userId: string,
  ): Promise<MemberDoc> {
    const membership = await this.members.findActiveMembership(
      householdId,
      userId,
    );
    if (!membership) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: "Household not found",
        details: { householdId },
      });
    }
    return membership;
  }

  /** Loads the caller's membership and asserts it is at least `owner`/`admin`. */
  async requireManager(
    householdId: string,
    userId: string,
  ): Promise<MemberDoc> {
    const membership = await this.requireActiveMember(householdId, userId);
    if (ROLE_RANK[membership.role] < ROLE_RANK.admin) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: "Only the household owner or an admin may do this",
      });
    }
    return membership;
  }

  /** True when `actor` outranks `target` (used to gate role/removal changes). */
  outranks(actor: HouseholdRole, target: HouseholdRole): boolean {
    return ROLE_RANK[actor] > ROLE_RANK[target];
  }
}
