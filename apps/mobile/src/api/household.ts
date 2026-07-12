import { z } from "zod";
import {
  householdInviteResponseSchema,
  householdMemberResponseSchema,
  householdResponseSchema,
  type CreateHouseholdInput,
  type CreateInviteInput,
  type HouseholdInviteResponse,
  type HouseholdMemberResponse,
  type HouseholdResponse,
  type UpdateHouseholdInput,
  type UpdateMemberInput,
} from "@kitchenpal/api-contract";
import { api } from "./api";

/** List endpoints return their rows inside the paginated envelope's `data`. */
const householdListSchema = z.array(householdResponseSchema);
const memberListSchema = z.array(householdMemberResponseSchema);
const inviteListSchema = z.array(householdInviteResponseSchema);

/**
 * Household + membership + invite endpoint wrappers. Each unwraps and validates
 * the response envelope. All routes require the access token; membership/role is
 * enforced server-side against the `:householdId` path.
 */
export const householdApi = {
  /** Households the caller belongs to (usually zero or one in personal-first use). */
  list: (): Promise<HouseholdResponse[]> =>
    api.request("households", {
      method: "GET",
      auth: true,
      schema: householdListSchema,
    }),

  create: (input: CreateHouseholdInput): Promise<HouseholdResponse> =>
    api.request("households", {
      body: input,
      auth: true,
      schema: householdResponseSchema,
    }),

  rename: (
    householdId: string,
    input: UpdateHouseholdInput,
  ): Promise<HouseholdResponse> =>
    api.request(`households/${householdId}`, {
      method: "PATCH",
      body: input,
      auth: true,
      schema: householdResponseSchema,
    }),

  remove: (householdId: string): Promise<void> =>
    api
      .request(`households/${householdId}`, { method: "DELETE", auth: true })
      .then(() => undefined),

  members: (householdId: string): Promise<HouseholdMemberResponse[]> =>
    api.request(`households/${householdId}/members`, {
      method: "GET",
      auth: true,
      schema: memberListSchema,
    }),

  updateMemberRole: (
    householdId: string,
    memberId: string,
    input: UpdateMemberInput,
  ): Promise<HouseholdMemberResponse> =>
    api.request(`households/${householdId}/members/${memberId}`, {
      method: "PATCH",
      body: input,
      auth: true,
      schema: householdMemberResponseSchema,
    }),

  /** Remove a member; also used for self-leave (pass the caller's member id). */
  removeMember: (householdId: string, memberId: string): Promise<void> =>
    api
      .request(`households/${householdId}/members/${memberId}`, {
        method: "DELETE",
        auth: true,
      })
      .then(() => undefined),

  invites: (householdId: string): Promise<HouseholdInviteResponse[]> =>
    api.request(`households/${householdId}/invites`, {
      method: "GET",
      auth: true,
      schema: inviteListSchema,
    }),

  createInvite: (
    householdId: string,
    input: CreateInviteInput,
  ): Promise<HouseholdInviteResponse> =>
    api.request(`households/${householdId}/invites`, {
      body: input,
      auth: true,
      schema: householdInviteResponseSchema,
    }),

  revokeInvite: (householdId: string, inviteId: string): Promise<void> =>
    api
      .request(`households/${householdId}/invites/${inviteId}`, {
        method: "DELETE",
        auth: true,
      })
      .then(() => undefined),

  /** Accept an invite code and join the household; returns the joined household. */
  acceptInvite: (code: string): Promise<HouseholdResponse> =>
    api.request(`invites/${encodeURIComponent(code)}/accept`, {
      method: "POST",
      auth: true,
      schema: householdResponseSchema,
    }),
};
