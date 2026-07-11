/**
 * KitchenPal spacing + radius + shadow tokens.
 * Spacing: 4-pt scale. Radius: sm..full plus component-specific (card/thumb).
 * Shadow: single soft warm-brown elevation used across cards.
 */
export const spacing = {
  0: 0,
  4: 4,
  8: 8,
  12: 12,
  16: 16,
  20: 20,
  24: 24,
  28: 28,
  32: 32,
  40: 40,
  48: 48,
} as const;

export type SpaceToken = keyof typeof spacing;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 28,
  card: 18,
  thumb: 14,
  full: 9999,
} as const;

export type RadiusToken = keyof typeof radius;

/** Web box-shadow string (~6% warm brown, y4 blur14). */
export const boxShadow = {
  card: "0 4px 14px rgba(43, 36, 32, 0.06)",
} as const;

/** React Native shadow descriptor (iOS props + Android elevation). */
export const rnShadow = {
  card: {
    shadowColor: "#2B2420",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 3,
  },
} as const;
