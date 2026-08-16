/**
 * KitchenPal color tokens — "Warm & Cozy", Light mode.
 *
 * THIS FILE IS THE SOURCE OF TRUTH. The palette began in Figma
 * (`WR7dg0wp3v61Fu0ecZURyN`) but was re-derived here on 2026-08-15 to fix
 * measured accessibility failures — the Figma values put secondary text at
 * 3.78:1, muted text at 2.21:1, and white-on-primary buttons at 3.28:1, all
 * below WCAG AA, and left cards at 1.04:1 against the page (invisible).
 * See `docs/superpowers/specs/2026-08-15-token-restyle-design.md`.
 *
 * Every pair the UI actually renders is locked by contrast invariants in
 * `__tests__/tokens.test.ts`. Change a value and the test tells you whether the
 * combination is still legible — that, not a hex match, is the contract.
 *
 * Dark mode is structurally supported (same keys) and will be added as a
 * `darkColors` map in a later pass — the design is "dark-ready", not yet dark.
 */
export const colors = {
  // Brand — primary (warm terracotta). Darkened until white label text on a
  // filled button clears 4.5:1; the hue still reads as the original brand.
  primary: "#C9502A",
  "primary-hover": "#A83F1F",
  "primary-soft": "#FBE0D4",

  // Brand — secondary (sage green)
  secondary: "#3F7D55",
  "secondary-soft": "#DDEBE1",

  // Brand — accent (amber). Deeper than a bright gold because it is used as INK
  // — star ratings, badge labels — where #F4B740 measured ~1.9:1 on white.
  accent: "#B87400",
  "accent-soft": "#FBEBCB",

  // Semantic status. Same reasoning as accent: these appear as text and icons,
  // not only as fills, so each clears 4.5:1 on `surface`.
  success: "#2F7D52",
  "success-soft": "#DDEFE4",
  warning: "#8A5A00",
  "warning-soft": "#FBEBCF",
  danger: "#C0392B",
  "danger-soft": "#FBDED9",
  info: "#2C5FA8",
  "info-soft": "#DCE7F8",

  // Surfaces. Ordered as a real stack: `bg` is the floor, `surface` sits on it
  // (1.21:1 — enough to see a card edge), `surface-alt` is a muted raised
  // panel, and `surface-sunken` recedes below the floor.
  bg: "#F1E8DD",
  surface: "#FFFFFF",
  "surface-alt": "#FAF5EF",
  "surface-sunken": "#E4D7C7",

  // Text — three steps, all ≥4.5:1 on both `bg` and `surface`.
  text: "#241E1A",
  "text-muted": "#6A5D53",
  "text-subtle": "#736659",
  "text-inverse": "#FFFFFF",

  // Borders. `border` is a visible hairline; `border-strong` clears 3:1 so it
  // can carry input boundaries and focus rings.
  border: "#CDBCA8",
  "border-strong": "#9E8B76",
} as const;

export type ColorToken = keyof typeof colors;
