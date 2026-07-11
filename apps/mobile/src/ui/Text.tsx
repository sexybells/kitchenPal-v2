import { Text as RNText, type TextProps as RNTextProps } from "react-native";
import { textStyle, theme, type ColorToken, type TextStyleToken } from "../theme";

export interface TextProps extends RNTextProps {
  /** Design text style token (maps size/weight/line-height from the tokens). */
  variant?: TextStyleToken;
  /** Color token; defaults to primary text. */
  color?: ColorToken;
  center?: boolean;
}

/**
 * Typed text primitive. All typography flows through the design text styles —
 * screens pick a `variant`, never raw font sizes.
 */
export function Text({
  variant = "body-m",
  color = "text",
  center,
  style,
  ...rest
}: TextProps) {
  return (
    <RNText
      style={[
        textStyle(variant),
        { color: theme.colors[color] },
        center ? { textAlign: "center" } : null,
        style,
      ]}
      {...rest}
    />
  );
}
