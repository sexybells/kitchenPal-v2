import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import type {
  CreateHouseholdInput,
  CreateInviteInput,
  UpdateHouseholdInput,
  UpdateMemberInput,
} from "@kitchenpal/api-contract";
import { householdApi } from "../../api/household";

/** Household query keys — centralised so mutations invalidate consistently. */
export const householdKeys = {
  all: ["household"] as const,
  list: ["household", "list"] as const,
  members: (householdId: string) =>
    ["household", householdId, "members"] as const,
  invites: (householdId: string) =>
    ["household", householdId, "invites"] as const,
};

/** Invalidate everything household-scoped after a membership/invite change. */
const invalidateHousehold = (client: QueryClient) =>
  client.invalidateQueries({ queryKey: householdKeys.all });

/**
 * The caller's households. In personal-first use this is usually empty (personal
 * mode) or a single household; the screen keys off the first entry.
 */
export const useHouseholds = () =>
  useQuery({
    queryKey: householdKeys.list,
    queryFn: () => householdApi.list(),
  });

export const useMembers = (householdId: string | undefined) =>
  useQuery({
    queryKey: householdKeys.members(householdId ?? ""),
    queryFn: () => householdApi.members(householdId as string),
    enabled: Boolean(householdId),
  });

export const useInvites = (householdId: string | undefined) =>
  useQuery({
    queryKey: householdKeys.invites(householdId ?? ""),
    queryFn: () => householdApi.invites(householdId as string),
    enabled: Boolean(householdId),
  });

export const useCreateHousehold = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateHouseholdInput) => householdApi.create(input),
    onSuccess: () => invalidateHousehold(client),
  });
};

export const useRenameHousehold = (householdId: string) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateHouseholdInput) =>
      householdApi.rename(householdId, input),
    onSuccess: () => invalidateHousehold(client),
  });
};

export const useAcceptInvite = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => householdApi.acceptInvite(code),
    onSuccess: () => invalidateHousehold(client),
  });
};

export const useCreateInvite = (householdId: string) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateInviteInput) =>
      householdApi.createInvite(householdId, input),
    onSuccess: () => invalidateHousehold(client),
  });
};

export const useRevokeInvite = (householdId: string) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (inviteId: string) =>
      householdApi.revokeInvite(householdId, inviteId),
    onSuccess: () => invalidateHousehold(client),
  });
};

export const useUpdateMemberRole = (householdId: string) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (params: { memberId: string; input: UpdateMemberInput }) =>
      householdApi.updateMemberRole(householdId, params.memberId, params.input),
    onSuccess: () => invalidateHousehold(client),
  });
};

export const useRemoveMember = (householdId: string) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) =>
      householdApi.removeMember(householdId, memberId),
    onSuccess: () => invalidateHousehold(client),
  });
};

export const useLeaveOrDeleteHousehold = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (householdId: string) => householdApi.remove(householdId),
    onSuccess: () => invalidateHousehold(client),
  });
};
