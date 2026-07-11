/**
 * Authenticated principal attached to `request.user`. The authentication phase
 * populates this from a verified JWT; identity is never trusted from the client
 * body. `activeHouseholdId` selects the household scope when the user is acting
 * inside a household.
 */
export interface AuthUser {
  id: string;
  roles: string[];
  activeHouseholdId?: string | null;
}
