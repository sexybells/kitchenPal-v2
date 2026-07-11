import { colors } from "./colors.js";
import { spacing, radius, boxShadow } from "./spacing.js";
import { textStyles, fontFamily } from "./typography.js";

/**
 * Tailwind preset for the admin app (Vite + shadcn/ui).
 * Import in `tailwind.config.ts`: `{ presets: [tailwindPreset] }`.
 * Colors keep their token keys (e.g. `bg-primary`, `text-text-muted`).
 */
const fontSize = Object.fromEntries(
  Object.entries(textStyles).map(([name, s]) => [
    name,
    [
      `${s.fontSize}px`,
      { lineHeight: `${s.lineHeight}px`, fontWeight: String(s.fontWeight) },
    ],
  ]),
);

const borderRadius = Object.fromEntries(
  Object.entries(radius).map(([name, value]) => [
    name,
    value === 9999 ? "9999px" : `${value}px`,
  ]),
);

const spacingPx = Object.fromEntries(
  Object.entries(spacing).map(([name, value]) => [name, `${value}px`]),
);

export const tailwindPreset = {
  theme: {
    extend: {
      colors: { ...colors },
      spacing: spacingPx,
      borderRadius,
      fontFamily: { sans: [fontFamily.sans, "sans-serif"] },
      fontSize,
      boxShadow: { card: boxShadow.card },
    },
  },
} as const;
