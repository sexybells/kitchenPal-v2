import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { Role } from "@kitchenpal/api-contract";
import { RequireAdmin } from "../require-admin";
import { sessionStore } from "../session-store";

function setSession(roles: Role[]): void {
  sessionStore.setSession(
    {
      id: "u1",
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
    },
    { accessToken: "a", refreshToken: "r", expiresIn: 600 },
  );
}

function renderGuarded() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/login" element={<p>Login screen</p>} />
        <Route
          path="/"
          element={
            <RequireAdmin>
              <p>Dashboard</p>
            </RequireAdmin>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => sessionStore.clear());

describe("RequireAdmin", () => {
  it("lands an authenticated admin on the protected screen", () => {
    setSession(["user", "admin"]);
    renderGuarded();
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  it("redirects an unauthenticated visitor to login", () => {
    renderGuarded();
    expect(screen.getByText("Login screen")).toBeInTheDocument();
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
  });

  it("redirects a non-admin session to login", () => {
    setSession(["user"]);
    renderGuarded();
    expect(screen.getByText("Login screen")).toBeInTheDocument();
  });
});
