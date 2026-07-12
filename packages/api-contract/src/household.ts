import { z } from "zod";
import { tokenPairSchema } from "./auth.js";
import { objectIdSchema } from "./pantry.js";

/**
 * Household roles, ordered by authority: `owner > admin > member`. Only owners
 * and admins may manage membership and invites; the owner is unique per
 * household and cannot be demoted or removed.
 */
export const householdRoleSchema = z.enum(["owner", "admin", "member"]);
export type HouseholdRole = z.infer<typeof householdRoleSchema>;

/**
 * Membership lifecycle. `active` members can act in the household; `invited` is
 * a pending seat reserved by an invite; `removed` is a tombstone kept for audit
 * so a re-invite does not collide on the unique (household, user) pair.
 */
export const memberStatusSchema = z.enum(["active", "invited", "removed"]);
export type MemberStatus = z.infer<typeof memberStatusSchema>;

/** A household as returned to its members. */
export const householdResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  ownerUserId: z.string(),
  membersCount: z.number().int().nonnegative(),
  /** The caller's own role in this household. */
  myRole: householdRoleSchema,
  version: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type HouseholdResponse = z.infer<typeof householdResponseSchema>;

/**
 * Returned when joining a household changes the caller's active scope (creating
 * a household or accepting an invite): the household plus a FRESH token pair
 * whose access token already carries the new `activeHouseholdId`. The client
 * switches into household scope immediately — no manual re-login or refresh
 * round-trip. Read/list household endpoints omit `tokens`.
 */
export const householdJoinResultSchema = householdResponseSchema.extend({
  tokens: tokenPairSchema,
});
export type HouseholdJoinResult = z.infer<typeof householdJoinResultSchema>;

/** A single membership row within a household. */
export const householdMemberResponseSchema = z.object({
  id: z.string(),
  householdId: z.string(),
  userId: z.string(),
  role: householdRoleSchema,
  status: memberStatusSchema,
  /** Denormalized display fields resolved from the member's account. */
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type HouseholdMemberResponse = z.infer<
  typeof householdMemberResponseSchema
>;

/** Create a household; the caller becomes its owner. */
export const createHouseholdSchema = z.object({
  name: z.string().min(1).max(80),
});
export type CreateHouseholdInput = z.infer<typeof createHouseholdSchema>;

/** Rename a household (owner/admin only). Optimistic-lock via `version`. */
export const updateHouseholdSchema = z.object({
  name: z.string().min(1).max(80),
});
export type UpdateHouseholdInput = z.infer<typeof updateHouseholdSchema>;

/** Change a member's role (owner/admin only). Owner role is not assignable. */
export const updateMemberSchema = z.object({
  role: z.enum(["admin", "member"]),
});
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;

/** An invite code for joining a household. */
export const householdInviteResponseSchema = z.object({
  id: z.string(),
  householdId: z.string(),
  code: z.string(),
  status: z.enum(["pending", "accepted", "revoked"]),
  /** ISO expiry; accepting after this fails. */
  expiresAt: z.string(),
  invitedBy: z.string(),
  createdAt: z.string(),
});
export type HouseholdInviteResponse = z.infer<
  typeof householdInviteResponseSchema
>;

/** Create an invite. `ttlHours` bounds how long the code stays acceptable. */
export const createInviteSchema = z.object({
  ttlHours: z.number().int().min(1).max(720).default(72),
});
export type CreateInviteInput = z.infer<typeof createInviteSchema>;

/** The household path parameter shared by member/invite/chat routes. */
export const householdIdParamSchema = z.object({
  householdId: objectIdSchema,
});
export type HouseholdIdParam = z.infer<typeof householdIdParamSchema>;
