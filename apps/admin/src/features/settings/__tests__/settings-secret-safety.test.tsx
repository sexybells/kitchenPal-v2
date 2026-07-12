import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import type { SystemSettingsResponse } from "@kitchenpal/api-contract";
import { renderWithProviders } from "@/test-utils/render";
import { isSecretKey, previewConfigValue } from "../secret-safety";

const getIntegrations = vi.fn<() => Promise<SystemSettingsResponse>>();
vi.mock("@/api/admin", () => ({
  adminApi: {
    getIntegrations: () => getIntegrations(),
    updateIntegration: vi.fn(),
  },
}));

import { SettingsPage } from "../settings-page";

describe("secret-safety helpers", () => {
  it("flags secret-looking key names", () => {
    expect(isSecretKey("apiKey")).toBe(true);
    expect(isSecretKey("secretAccessKey")).toBe(true);
    expect(isSecretKey("password")).toBe(true);
    expect(isSecretKey("provider")).toBe(false);
    expect(isSecretKey("model")).toBe(false);
  });

  it("previews non-secret values compactly", () => {
    expect(previewConfigValue("openai")).toBe("openai");
    expect(previewConfigValue(true)).toBe("true");
    expect(previewConfigValue(["a", "b"])).toBe("2 item(s)");
  });
});

describe("SettingsPage", () => {
  it("never renders a secret value even if one is present in config", async () => {
    getIntegrations.mockResolvedValue({
      settings: [
        {
          key: "ai",
          enabled: true,
          config: { provider: "openai", apiKey: "SUPER-SECRET-VALUE" },
          updatedAt: "2026-07-01T00:00:00.000Z",
        },
      ],
    });

    renderWithProviders(<SettingsPage />);

    // Non-secret config is shown…
    expect(await screen.findByText("openai")).toBeInTheDocument();
    // …but the secret value is masked and never rendered.
    expect(screen.queryByText("SUPER-SECRET-VALUE")).not.toBeInTheDocument();
    expect(screen.getByText("managed in env")).toBeInTheDocument();
  });
});
