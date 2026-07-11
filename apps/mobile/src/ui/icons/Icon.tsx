import { memo } from "react";
import Svg, { Path, Circle } from "react-native-svg";
import { theme, type ColorToken } from "../../theme";

/**
 * Line-icon set (1.8 stroke, 24-grid) matching the Figma `icon/*` / `food/*`
 * libraries. Per the design rendering rule, raw ingredients use line icons
 * (e.g. `leaf`) — never emoji; cooked-dish emoji are used as plain text.
 */
export type IconName =
  | "home"
  | "pantry"
  | "meals"
  | "shopping"
  | "plus"
  | "scan"
  | "bell"
  | "settings"
  | "spending"
  | "household"
  | "leaf"
  | "chevron-right"
  | "chevron-left"
  | "eye"
  | "eye-off"
  | "mail"
  | "lock"
  | "user"
  | "check"
  | "close"
  | "globe"
  | "alert"
  | "google"
  | "apple"
  | "fingerprint";

// Each entry is the inner markup of a 0 0 24 24 viewBox, stroked (fill: none)
// unless a glyph needs a solid fill (brand marks).
const PATHS: Record<IconName, React.ReactNode> = {
  home: <Path d="M3 10.5 12 3l9 7.5M5 9.5V20h5v-6h4v6h5V9.5" />,
  pantry: (
    <>
      <Path d="M6 3h12v18H6zM6 12h12" />
      <Path d="M9 7v2M9 15v2" />
    </>
  ),
  meals: (
    <>
      <Path d="M7 3v7a2 2 0 0 0 4 0V3M9 3v18" />
      <Path d="M16 3c-1.5 1-2 3-2 5s.5 3 2 3v10" />
    </>
  ),
  shopping: (
    <>
      <Path d="M4 5h2l2 11h9l2-8H7" />
      <Circle cx={9} cy={20} r={1.4} />
      <Circle cx={17} cy={20} r={1.4} />
    </>
  ),
  plus: <Path d="M12 5v14M5 12h14" />,
  scan: (
    <>
      <Path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
      <Circle cx={12} cy={12} r={3} />
    </>
  ),
  bell: <Path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6M10 20a2 2 0 0 0 4 0" />,
  settings: (
    <>
      <Circle cx={12} cy={12} r={3} />
      <Path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
    </>
  ),
  spending: <Path d="M4 19V5M4 19h16M8 15v-4M12 15V8M16 15v-6" />,
  household: (
    <>
      <Circle cx={9} cy={8} r={3} />
      <Path d="M3 20c0-3 3-5 6-5s6 2 6 5M16 6a3 3 0 0 1 0 6M18 20c0-2-1-3.5-3-4.5" />
    </>
  ),
  leaf: <Path d="M4 20C4 11 11 4 20 4c0 9-7 16-16 16ZM4 20l8-8" />,
  "chevron-right": <Path d="M9 6l6 6-6 6" />,
  "chevron-left": <Path d="M15 6l-6 6 6 6" />,
  eye: (
    <>
      <Path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <Circle cx={12} cy={12} r={3} />
    </>
  ),
  "eye-off": <Path d="M4 4l16 16M9.5 9.6A3 3 0 0 0 14.4 14.5M6.7 6.8C3.9 8.4 2 12 2 12s3.5 7 10 7c1.9 0 3.6-.6 5-1.4M11 5.1c.3 0 .7-.1 1-.1 6.5 0 10 7 10 7a17 17 0 0 1-2.2 3" />,
  mail: (
    <>
      <Path d="M3 6h18v12H3zM3 7l9 6 9-6" />
    </>
  ),
  lock: (
    <>
      <Path d="M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  user: (
    <>
      <Circle cx={12} cy={8} r={4} />
      <Path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
    </>
  ),
  check: <Path d="M5 13l4 4L19 7" />,
  close: <Path d="M6 6l12 12M18 6L6 18" />,
  globe: (
    <>
      <Circle cx={12} cy={12} r={9} />
      <Path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
    </>
  ),
  alert: (
    <>
      <Circle cx={12} cy={12} r={9} />
      <Path d="M12 7v6M12 16.5v.5" />
    </>
  ),
  fingerprint: <Path d="M8 11a4 4 0 0 1 8 0v3M6 13v1a10 10 0 0 0 1 4M12 11v4a6 6 0 0 0 1 3M9.5 20a8 8 0 0 1-1-4v-2M4 9a9 9 0 0 1 16 0" />,
  // Brand marks are filled glyphs, drawn from the icon color.
  google: (
    <Path
      d="M21 12.2c0-.7-.1-1.3-.2-2H12v3.8h5.1c-.2 1.2-.9 2.2-1.9 2.9v2.4h3.1c1.8-1.7 2.7-4.2 2.7-7.1Z"
      fill="currentColor"
      stroke="none"
    />
  ),
  apple: (
    <Path
      d="M16 3c.1 1-.3 2-1 2.7-.6.7-1.6 1.2-2.5 1.1-.1-1 .4-2 1-2.6.6-.7 1.7-1.2 2.5-1.2Zm2.5 14c-.5 1.2-.8 1.7-1.5 2.7-1 1.4-2.3 3.1-4 3.1-1.4 0-1.8-.9-3.7-.9s-2.4.9-3.7.9c-1.7 0-2.9-1.6-3.9-3-2.7-3.9-3-8.5-1.3-11 1.2-1.7 3-2.7 4.7-2.7 1.7 0 2.8 1 4.2 1 1.4 0 2.2-1 4.2-1 1.5 0 3.1.8 4.2 2.3-3.7 2-3.1 7.3.5 8.6Z"
      fill="currentColor"
      stroke="none"
    />
  ),
};

export interface IconProps {
  name: IconName;
  size?: number;
  color?: ColorToken;
  /** Raw hex override (used for brand marks that aren't a design token). */
  colorValue?: string;
  strokeWidth?: number;
}

export const Icon = memo(function Icon({
  name,
  size = 24,
  color = "text",
  colorValue,
  strokeWidth = 1.8,
}: IconProps) {
  const resolved = colorValue ?? theme.colors[color];
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={resolved}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      color={resolved}
    >
      {PATHS[name]}
    </Svg>
  );
});
