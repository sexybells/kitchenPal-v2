/**
 * @kitchenpal/design-tokens — single source of truth for color, type, spacing,
 * radius, and shadow. Consumed as: TS constants (all apps), a Tailwind preset
 * (admin), and an RN theme object (mobile).
 */
export * from "./colors.js";
export * from "./typography.js";
export * from "./spacing.js";
export { tailwindPreset } from "./tailwind-preset.js";
export { rnTheme } from "./rn-theme.js";
