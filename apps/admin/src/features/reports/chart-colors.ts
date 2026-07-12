import { colors } from "@kitchenpal/design-tokens";

/**
 * Recharts needs literal color strings (SVG stroke/fill), which cannot be
 * Tailwind classes. Sourcing them from the shared design tokens keeps the charts
 * on-palette without hardcoding hex values in the components.
 */
export const chartColors = {
  users: colors.primary,
  households: colors.secondary,
  calls: colors.info,
  failures: colors.danger,
  cost: colors.accent,
  grid: colors.border,
} as const;
