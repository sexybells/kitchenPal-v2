import { SetMetadata } from "@nestjs/common";
import type { Role } from "@kitchenpal/api-contract";

/** Metadata key holding the roles a route requires. */
export const ROLES_METADATA_KEY = "kitchenpal:roles";

/**
 * Declares the role(s) a route requires. The roles guard grants access when the
 * authenticated user holds at least one of them.
 */
export const Roles = (...roles: Role[]) =>
  SetMetadata(ROLES_METADATA_KEY, roles);
