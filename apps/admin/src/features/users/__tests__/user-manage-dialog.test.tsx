import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  AdminUserResponse,
  SubscriptionPlanResponse,
} from "@kitchenpal/api-contract";
import { renderWithProviders } from "@/test-utils/render";

const listPlans = vi.fn<() => Promise<SubscriptionPlanResponse[]>>();
const assignSubscription = vi.fn();
const cancelSubscription = vi.fn();
const updateUserRoles = vi.fn();
const suspendUser = vi.fn();

vi.mock("@/api/admin", () => ({
  adminApi: {
    listPlans: () => listPlans(),
    assignSubscription: (input: unknown) => assignSubscription(input),
    cancelSubscription: (userId: string) => cancelSubscription(userId),
    updateUserRoles: (id: string, roles: unknown) => updateUserRoles(id, roles),
    suspendUser: (id: string, suspended: boolean) => suspendUser(id, suspended),
  },
}));

import { UserManageDialog } from "../user-manage-dialog";

const user: AdminUserResponse = {
  id: "u1",
  email: "member@example.com",
  phone: null,
  displayName: "Member",
  avatarUrl: null,
  roles: ["user"],
  locale: "en",
  emailVerified: true,
  phoneVerified: false,
  activeHouseholdId: null,
  suspended: false,
  suspendedAt: null,
  version: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const plan: SubscriptionPlanResponse = {
  id: "plan-1",
  name: "Pro",
  tier: "pro",
  priceVnd: 99000,
  features: [],
  active: true,
  version: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("UserManageDialog subscription assignment", () => {
  it("assigns the selected plan via the admin endpoint", async () => {
    listPlans.mockResolvedValue([plan]);
    assignSubscription.mockResolvedValue({});

    renderWithProviders(
      <UserManageDialog user={user} onClose={() => {}} onChanged={() => {}} />,
    );

    // Wait for plans to load and the picker to default to the first plan.
    await screen.findByRole("option", { name: /Pro/ });

    await userEvent.click(screen.getByRole("button", { name: "Assign" }));

    await waitFor(() => {
      expect(assignSubscription).toHaveBeenCalledWith({
        userId: "u1",
        planId: "plan-1",
      });
    });
  });
});
