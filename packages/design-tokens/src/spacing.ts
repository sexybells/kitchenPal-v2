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
  card: 14,
  thumb: 12,
  full: 9999,
} as const;

export type RadiusToken = keyof typeof radius;

/**
 * Web box-shadow (~10% warm brown, y2 blur10). Tighter and stronger than the
 * previous 6%/y4/blur14: at 6% it was invisible on the old near-white ground,
 * and would be invisible twice over on the darker `bg` this palette uses.
 */
export const boxShadow = {
  card: "0 2px 10px rgba(36, 30, 26, 0.10)",
} as const;

/** React Native shadow descriptor (iOS props + Android elevation). */
export const rnShadow = {
  card: {
    shadowColor: "#241E1A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 2,
  },
} as const;
