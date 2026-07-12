import type { TFunction } from "i18next";
import type { BadgeTone } from "../../ui";
import type { HouseholdRole } from "@kitchenpal/api-contract";

/**
 * Roles are ordered by authority: owner > admin > member. Only owners and admins
 * may manage membership and invites; the owner is unique and cannot be demoted
 * or removed.
 */
export const canManageMembers = (role: HouseholdRole): boolean =>
  role === "owner" || role === "admin";

/** Whether `actor` may change `target`'s role. Owners are never reassignable. */
export const canChangeRole = (
  actor: HouseholdRole,
  target: HouseholdRole,
): boolean => canManageMembers(actor) && target !== "owner";

/** Localized role label for a member badge. */
export const roleLabel = (t: TFunction, role: HouseholdRole): string =>
  t(`household.role.${role}`);

/** Badge tone per role, so authority reads at a glance. */
export const roleTone = (role: HouseholdRole): BadgeTone => {
  switch (role) {
    case "owner":
      return "primary";
    case "admin":
      return "info";
    default:
      return "neutral";
  }
};
