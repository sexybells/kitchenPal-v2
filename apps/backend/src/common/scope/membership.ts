/**
 * Verifies household membership for the scope guard. Household scope must never
 * be resolved from a client-asserted `activeHouseholdId` alone — the guard asks
 * this seam whether the authenticated user is a CURRENT active member of that
 * household before granting household scope.
 *
 * Defined here (in common) as an abstract token so the guard has no hard
 * dependency on the household feature module; the household module binds the real
 * repository-backed implementation. The default binding is fail-closed (denies).
 */
export abstract class MembershipVerifier {
  abstract isActiveMember(
    userId: string,
    householdId: string,
  ): Promise<boolean>;
}

/**
 * Fail-closed fallback used when no household module is wired in. Denies every
 * household-scope resolution so an unconfigured deployment cannot leak
 * household data, rather than trusting the token's `activeHouseholdId`.
 */
export class DenyAllMembershipVerifier extends MembershipVerifier {
  isActiveMember(): Promise<boolean> {
    return Promise.resolve(false);
  }
}
