import { colors } from "./colors.js";
import { spacing, radius, rnShadow } from "./spacing.js";
import { textStyles, fontFamily, fontWeight } from "./typography.js";

/**
 * React Native theme object for the mobile app (Expo).
 * Numeric spacing/radius (RN uses unitless density-independent pixels) and
 * text styles ready to spread into <Text> style props.
 */
export const rnTheme = {
  colors,
  spacing,
  radius,
  shadow: rnShadow,
  fontFamily,
  fontWeight,
  textStyles,
} as const;

export type RnTheme = typeof rnTheme;
