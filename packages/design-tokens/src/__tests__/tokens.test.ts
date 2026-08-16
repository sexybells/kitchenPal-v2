import { describe, it, expect } from "vitest";
import { colors, type ColorToken } from "../colors.js";
import { contrastRatio } from "../contrast.js";
import { textStyles } from "../typography.js";
import { spacing, radius } from "../spacing.js";

/**
 * Guards the design-tokens package.
 *
 * Counts and shapes catch accidental additions or deletions. The contrast
 * invariants below replace the old "matches authoritative Figma hex" test:
 * this repo, not the Figma file, is now the source of truth, so pinning hex
 * values would only freeze arbitrary numbers. What must not regress is
 * legibility — a future palette is free to move hues, but not to make text
 * unreadable or cards invisible again.
 */
describe("design tokens", () => {
  it("ships the expected token counts", () => {
    expect(Object.keys(colors)).toHaveLength(25);
    expect(Object.keys(textStyles)).toHaveLength(13);
    expect(Object.keys(spacing)).toHaveLength(11);
    expect(Object.keys(radius)).toHaveLength(8);
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

/**
 * Every colour pair the UI actually renders, with the threshold it must clear:
 * 4.5 for text (WCAG AA), 3.0 for icons/non-text UI and input boundaries, and
 * 1.2 for one surface to be perceptible against another.
 */
const PAIRS: [ColorToken, ColorToken, number, string][] = [
  // Text on both grounds it can land on.
  ["text", "bg", 4.5, "body text on the page"],
  ["text", "surface", 4.5, "body text on a card"],
  ["text-muted", "bg", 4.5, "secondary label on the page"],
  ["text-muted", "surface", 4.5, "secondary label on a card"],
  ["text-subtle", "bg", 4.5, "muted label on the page"],
  ["text-subtle", "surface", 4.5, "muted label on a card"],
  ["text", "primary-soft", 4.5, "text on a soft brand chip"],

  // Filled buttons — the label must clear AA, not just large-text 3:1.
  ["text-inverse", "primary", 4.5, "label on the primary button"],
  ["text-inverse", "danger", 4.5, "label on the destructive button"],

  // Status colours used as ink, not only as fills.
  ["accent", "surface", 3, "star rating on a card"],
  ["warning", "surface", 4.5, "warning text on a card"],
  ["danger", "surface", 4.5, "error text on a card"],
  ["success", "surface", 4.5, "success text on a card"],
  ["primary", "bg", 3, "brand icon on the page"],

  // Structure: surfaces have to be tellable apart, borders visible.
  ["surface", "bg", 1.2, "card against the page"],
  ["surface-alt", "bg", 1.05, "muted panel against the page"],
  ["surface-sunken", "bg", 1.05, "sunken well against the page"],
  ["border", "surface", 1.6, "hairline on a card"],
  ["border-strong", "surface", 3, "input boundary on a card"],
];

describe("palette contrast invariants", () => {
  it.each(PAIRS)(
    "%s on %s clears %s:1 — %s",
    (foreground, background, minimum) => {
      const ratio = contrastRatio(colors[foreground], colors[background]);
      expect(ratio).toBeGreaterThanOrEqual(minimum);
    },
  );
});

describe("contrastRatio", () => {
  it("returns the known extremes", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5);
  });

  it("is order-independent", () => {
    expect(contrastRatio(colors.text, colors.bg)).toBeCloseTo(
      contrastRatio(colors.bg, colors.text),
      10,
    );
  });

  it("rejects anything that is not a #rrggbb colour", () => {
    expect(() => contrastRatio("red", "#FFFFFF")).toThrow();
    expect(() => contrastRatio("#FFF", "#FFFFFF")).toThrow();
  });
});
