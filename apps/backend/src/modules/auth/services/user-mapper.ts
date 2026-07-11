import type { UserResponse } from "@kitchenpal/api-contract";
import type { HydratedDocument } from "mongoose";
import type { UserEntity } from "../repositories/user.repository";

/**
 * Projects a user document into its public API representation. Timestamps become
 * ISO strings and verification flags collapse the internal `*VerifiedAt` dates
 * into booleans the client cares about.
 */
export function toUserResponse(
  user: HydratedDocument<UserEntity>,
): UserResponse {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    roles: user.roles,
    locale: user.locale,
    emailVerified: user.emailVerifiedAt !== null,
    phoneVerified: user.phoneVerifiedAt !== null,
    activeHouseholdId: user.activeHouseholdId
      ? user.activeHouseholdId.toString()
      : null,
    createdAt: (user.createdAt ?? new Date()).toISOString(),
  };
}
