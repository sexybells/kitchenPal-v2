import { rnTheme } from "@kitchenpal/design-tokens";
import type { TextStyle } from "react-native";

/**
 * The mobile theme is the design-tokens `rnTheme` verbatim — the single source
 * of truth for color, spacing, radius, shadow, and text styles. Never hardcode
 * hex/spacing in components; pull from here.
 */
export const theme = rnTheme;

export type ColorToken = keyof typeof rnTheme.colors;
export type SpaceToken = keyof typeof rnTheme.spacing;
export type RadiusToken = keyof typeof rnTheme.radius;
export type TextStyleToken = keyof typeof rnTheme.textStyles;

/** Resolve a color token to its hex value. */
export const color = (token: ColorToken): string => rnTheme.colors[token];

/** Resolve a spacing token to its numeric value. */
export const space = (token: SpaceToken): number => rnTheme.spacing[token];

/** Resolve a radius token to its numeric value. */
export const radius = (token: RadiusToken): number => rnTheme.radius[token];

/**
 * Map a design text style to a React Native `TextStyle`, mapping the numeric
 * font weight to the matching Plus Jakarta Sans family so weights render on
 * both platforms (RN honours `fontFamily`, not always `fontWeight`).
 */
export const textStyle = (token: TextStyleToken): TextStyle => {
  const style = rnTheme.textStyles[token];
  return {
    fontFamily: fontFamilyForWeight(style.fontWeight),
    fontSize: style.fontSize,
    lineHeight: style.lineHeight,
    letterSpacing: "letterSpacing" in style ? style.letterSpacing : undefined,
  };
};

/** The loaded font family names, keyed by numeric weight from the tokens. */
export const fontFamilyForWeight = (weight: number): string => {
  if (weight >= 800) return "PlusJakartaSans_800ExtraBold";
  if (weight >= 700) return "PlusJakartaSans_700Bold";
  if (weight >= 600) return "PlusJakartaSans_600SemiBold";
  if (weight >= 500) return "PlusJakartaSans_500Medium";
  return "PlusJakartaSans_400Regular";
};
