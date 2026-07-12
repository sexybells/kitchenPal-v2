import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test-utils/render";

const isDevToolsEnabled = vi.fn<() => boolean>();
vi.mock("@/lib/env", () => ({
  isDevToolsEnabled: () => isDevToolsEnabled(),
  env: { apiBaseUrl: "http://localhost", isProduction: false },
}));

vi.mock("@/api/admin", () => ({
  adminApi: {
    seedPlans: vi.fn(),
    seedRecipes: vi.fn(),
    resetDevData: vi.fn(),
  },
}));

import { DevToolsPage } from "../dev-tools-page";

afterEach(() => isDevToolsEnabled.mockReset());

describe("DevToolsPage prod guard", () => {
  it("hides the tools and shows a notice in production", () => {
    isDevToolsEnabled.mockReturnValue(false);

    renderWithProviders(<DevToolsPage />);

    expect(
      screen.getByText("Developer tools are disabled in production."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Seed plans" }),
    ).not.toBeInTheDocument();
  });

  it("exposes the seed and reset tools outside production", () => {
    isDevToolsEnabled.mockReturnValue(true);

    renderWithProviders(<DevToolsPage />);

    expect(
      screen.getByRole("button", { name: "Seed plans" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset…" })).toBeInTheDocument();
  });
});
