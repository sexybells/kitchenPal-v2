/**
 * KitchenPal typography tokens.
 * Font family: Plus Jakarta Sans. 13 text styles from Figma Foundations.
 * fontSize/fontWeight are canonical; lineHeight/letterSpacing are tuned
 * per role (tighter for display/headings, ~1.5 for body).
 */
export const fontFamily = {
  sans: "Plus Jakarta Sans",
} as const;

export const fontWeight = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  extrabold: 800,
} as const;

export interface TextStyle {
  fontSize: number;
  lineHeight: number;
  fontWeight: number;
  letterSpacing?: number;
}

export const textStyles = {
  "display-l": {
    fontSize: 30,
    lineHeight: 38,
    fontWeight: fontWeight.extrabold,
    letterSpacing: -0.5,
  },
  "display-m": {
    fontSize: 26,
    lineHeight: 34,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.4,
  },
  "heading-l": {
    fontSize: 22,
    lineHeight: 30,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.2,
  },
  "heading-m": {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: fontWeight.semibold,
  },
  "heading-s": {
    fontSize: 18,
    lineHeight: 26,
    fontWeight: fontWeight.semibold,
  },
  title: { fontSize: 16, lineHeight: 24, fontWeight: fontWeight.semibold },
  "body-l": { fontSize: 16, lineHeight: 24, fontWeight: fontWeight.regular },
  "body-m": { fontSize: 14, lineHeight: 22, fontWeight: fontWeight.regular },
  "label-m": { fontSize: 14, lineHeight: 20, fontWeight: fontWeight.semibold },
  "label-s": { fontSize: 12, lineHeight: 16, fontWeight: fontWeight.semibold },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: fontWeight.medium },
  button: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.2,
  },
  overline: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.8,
  },
} as const satisfies Record<string, TextStyle>;

export type TextStyleToken = keyof typeof textStyles;
