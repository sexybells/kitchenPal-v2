/**
 * WCAG 2.1 relative-luminance contrast, used to keep the palette honest.
 *
 * Lives in the tokens package rather than a test file because the ratio is a
 * property OF the palette: any consumer adding a colour pair should be able to
 * check it the same way the token tests do.
 */

/** Channel value (0..255) to linear-light, per WCAG 2.1 relative luminance. */
function channelToLinear(value: number): number {
  const channel = value / 255;
  return channel <= 0.03928
    ? channel / 12.92
    : Math.pow((channel + 0.055) / 1.055, 2.4);
}

/** Relative luminance of a `#rrggbb` colour. */
export function relativeLuminance(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match?.[1]) {
    throw new Error(`Expected a #rrggbb colour, received "${hex}"`);
  }
  const value = parseInt(match[1], 16);
  const red = channelToLinear((value >> 16) & 0xff);
  const green = channelToLinear((value >> 8) & 0xff);
  const blue = channelToLinear(value & 0xff);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/**
 * Contrast ratio between two colours, from 1 (identical) to 21 (black on
 * white). Order-independent.
 *
 * Thresholds this codebase holds itself to:
 * - 4.5 — body and label text, and white text on a filled button
 * - 3.0 — icons, other non-text UI, and input boundaries
 * - 1.2 — the minimum for one surface to be perceptible against another
 */
export function contrastRatio(foreground: string, background: string): number {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}
