import { describe, it, expect } from "vitest";
import { colors } from "../colors.js";
import { textStyles } from "../typography.js";
import { spacing, radius } from "../spacing.js";

/**
 * Guards the design-tokens package against silent drift from the Figma
 * Foundations. Locks token counts and the authoritative key hex values.
 * (The four `*-soft` status tints are derived — see colors.ts — and are
 * intentionally NOT pinned here until reconciled against Figma.)
 */
describe("design tokens", () => {
  it("ships the expected token counts", () => {
    expect(Object.keys(colors)).toHaveLength(25);
    expect(Object.keys(textStyles)).toHaveLength(13);
    expect(Object.keys(spacing)).toHaveLength(11);
    expect(Object.keys(radius)).toHaveLength(8);
  });

  it("matches authoritative Figma hex values", () => {
    expect(colors.primary).toBe("#E8663D");
    expect(colors["primary-hover"]).toBe("#D2542D");
    expect(colors["primary-soft"]).toBe("#FBE4D9");
    expect(colors.secondary).toBe("#5E9A72");
    expect(colors.accent).toBe("#F4B740");
    expect(colors.bg).toBe("#FFF9F3");
    expect(colors.surface).toBe("#FFFFFF");
    expect(colors.text).toBe("#2B2420");
    expect(colors.border).toBe("#EBE1D6");
  });

  it("keeps the 4-pt spacing scale", () => {
    expect(spacing[4]).toBe(4);
    expect(spacing[16]).toBe(16);
    expect(spacing[48]).toBe(48);
  });

  it("exposes the canonical text style shape", () => {
    expect(textStyles["display-l"]).toMatchObject({
      fontSize: 30,
      fontWeight: 800,
    });
    expect(textStyles.button).toMatchObject({ fontSize: 15, fontWeight: 700 });
  });
});
