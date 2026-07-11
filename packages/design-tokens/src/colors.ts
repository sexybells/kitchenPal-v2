/**
 * KitchenPal color tokens — "Warm & Cozy", Light mode.
 * Canonical source: Figma `WR7dg0wp3v61Fu0ecZURyN` (page "🎨 Foundations").
 *
 * Values marked (derived) are pale tints generated to match the existing
 * `*-soft` pattern (e.g. primary #E8663D -> primary-soft #FBE4D9) because the
 * Figma desktop MCP could not be read without a live layer selection.
 * Reconcile these four against Figma when the Foundations frame is selected.
 *
 * Dark mode is structurally supported (same keys) and will be added as a
 * `darkColors` map in a later pass — the design is "dark-ready", not yet dark.
 */
export const colors = {
  // Brand — primary (warm terracotta)
  primary: "#E8663D",
  "primary-hover": "#D2542D",
  "primary-soft": "#FBE4D9",

  // Brand — secondary (sage green)
  secondary: "#5E9A72",
  "secondary-soft": "#E1EDE3",

  // Brand — accent (golden)
  accent: "#F4B740",
  "accent-soft": "#FCEECB",

  // Semantic status
  success: "#3E9B6B",
  "success-soft": "#DDEFE4", // (derived)
  warning: "#E8A73C",
  "warning-soft": "#FBEBCF", // (derived)
  danger: "#E0503F",
  "danger-soft": "#FBDED9", // (derived)
  info: "#4E82D6",
  "info-soft": "#DCE7F8", // (derived)

  // Surfaces (warm off-white stack)
  bg: "#FFF9F3",
  surface: "#FFFFFF",
  "surface-alt": "#F7F1EA",
  "surface-sunken": "#F1E9DF",

  // Text
  text: "#2B2420",
  "text-muted": "#8A7E74",
  "text-subtle": "#B4A99E",
  "text-inverse": "#FFFFFF",

  // Borders
  border: "#EBE1D6",
  "border-strong": "#DBCFC0",
} as const;

export type ColorToken = keyof typeof colors;
