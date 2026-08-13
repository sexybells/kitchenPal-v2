import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  AdminUserResponse,
  SubscriptionPlanResponse,
  UserResponse,
} from "@kitchenpal/api-contract";
import { renderWithProviders } from "@/test-utils/render";
import { sessionStore } from "@/auth/session-store";

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

/** Sign a user id in as the current admin session (marks the row as "self"). */
function signInAs(id: string, roles: UserResponse["roles"] = ["user", "admin"]) {
  const sessionUser: UserResponse = {
    id,
    email: "admin@example.com",
    phone: null,
    displayName: "Admin",
    avatarUrl: null,
    roles,
    locale: "en",
    emailVerified: true,
    phoneVerified: false,
    activeHouseholdId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  sessionStore.setSession(sessionUser, {
    accessToken: "a",
    refreshToken: "r",
    expiresIn: 600,
  });
}

beforeEach(() => {
  listPlans.mockResolvedValue([plan]);
  assignSubscription.mockResolvedValue({});
  suspendUser.mockResolvedValue({ ...user, suspended: true });
  updateUserRoles.mockResolvedValue({ ...user, roles: ["user"] });
});

afterEach(() => {
  sessionStore.clear();
  vi.restoreAllMocks();
  listPlans.mockReset();
  assignSubscription.mockReset();
  cancelSubscription.mockReset();
  updateUserRoles.mockReset();
  suspendUser.mockReset();
});

describe("UserManageDialog subscription assignment", () => {
  it("assigns the selected plan via the admin endpoint", async () => {
    renderWithProviders(
      <UserManageDialog user={user} onClose={() => {}} onChanged={() => {}} />,
    );

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

describe("UserManageDialog self-lockout guard", () => {
  it("disables self-suspend for the current admin's own account", () => {
    signInAs("u1");
    renderWithProviders(
      <UserManageDialog user={user} onClose={() => {}} onChanged={() => {}} />,
    );

    expect(screen.getByRole("button", { name: "Suspend" })).toBeDisabled();
    expect(
      screen.getByText(/can't suspend your own account/i),
    ).toBeInTheDocument();
  });

  it("keeps suspend enabled for other users", () => {
    signInAs("someone-else");
    renderWithProviders(
      <UserManageDialog user={user} onClose={() => {}} onChanged={() => {}} />,
    );

    expect(screen.getByRole("button", { name: "Suspend" })).toBeEnabled();
  });
});

describe("UserManageDialog suspend confirmation", () => {
  it("confirms before suspending and calls the endpoint when confirmed", async () => {
    signInAs("someone-else");
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);

    renderWithProviders(
      <UserManageDialog user={user} onClose={() => {}} onChanged={() => {}} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Suspend" }));

    expect(confirm).toHaveBeenCalled();
    await waitFor(() => {
      expect(suspendUser).toHaveBeenCalledWith("u1", true);
    });
  });

  it("does not suspend when the confirmation is dismissed", async () => {
    signInAs("someone-else");
    vi.spyOn(window, "confirm").mockReturnValue(false);

    renderWithProviders(
      <UserManageDialog user={user} onClose={() => {}} onChanged={() => {}} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Suspend" }));

    expect(suspendUser).not.toHaveBeenCalled();
  });
});

describe("UserManageDialog self role guard", () => {
  it("disables the admin-role switch for the current admin's own account", () => {
    // Self-demotion is rejected by the backend unconditionally, so the control
    // is disabled for the current user rather than letting them trigger a 400.
    signInAs("u1");
    const adminRow: AdminUserResponse = { ...user, roles: ["user", "admin"] };

    renderWithProviders(
      <UserManageDialog
        user={adminRow}
        onClose={() => {}}
        onChanged={() => {}}
      />,
    );

    expect(
      screen.getByRole("switch", { name: "Toggle administrator role" }),
    ).toBeDisabled();
    expect(
      screen.getByText(/can't change your own admin role/i),
    ).toBeInTheDocument();
  });

  it("keeps the admin-role switch enabled for other users", () => {
    signInAs("someone-else");
    renderWithProviders(
      <UserManageDialog user={user} onClose={() => {}} onChanged={() => {}} />,
    );

    expect(
      screen.getByRole("switch", { name: "Toggle administrator role" }),
    ).toBeEnabled();
  });
});
