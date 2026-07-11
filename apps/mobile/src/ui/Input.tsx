import { useState } from "react";
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { useTranslation } from "react-i18next";
import { fontFamilyForWeight, theme } from "../theme";
import { Text } from "./Text";
import { Icon, type IconName } from "./icons/Icon";

export interface InputProps extends Omit<TextInputProps, "style"> {
  label?: string;
  error?: string;
  leftIcon?: IconName;
  /** Renders a show/hide toggle and masks the value. */
  secure?: boolean;
  testID?: string;
}

/**
 * Text field mirroring Figma `cmp/input`: soft surface, warm border, focus
 * highlight, optional leading icon, password reveal, and inline error text.
 */
export function Input({
  label,
  error,
  leftIcon,
  secure = false,
  testID,
  onFocus,
  onBlur,
  ...rest
}: InputProps) {
  const { t } = useTranslation();
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(secure);

  const borderColor = error
    ? theme.colors.danger
    : focused
      ? theme.colors.primary
      : theme.colors.border;

  return (
    <View style={styles.wrapper}>
      {label ? (
        <Text variant="label-m" color="text" style={styles.label}>
          {label}
        </Text>
      ) : null}
      <View style={[styles.field, { borderColor }]}>
        {leftIcon ? (
          <Icon name={leftIcon} size={20} color="text-muted" />
        ) : null}
        <TextInput
          testID={testID}
          style={styles.input}
          placeholderTextColor={theme.colors["text-subtle"]}
          secureTextEntry={hidden}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          {...rest}
        />
        {secure ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hidden ? t("common.showPassword") : t("common.hidePassword")}
            onPress={() => setHidden((value) => !value)}
            hitSlop={8}
          >
            <Icon name={hidden ? "eye" : "eye-off"} size={20} color="text-muted" />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text variant="caption" color="danger" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: theme.spacing[8] },
  label: { marginBottom: theme.spacing[4] },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[8],
    minHeight: 52,
    borderWidth: 1.5,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing[16],
    backgroundColor: theme.colors.surface,
  },
  input: {
    flex: 1,
    fontFamily: fontFamilyForWeight(theme.fontWeight.regular),
    fontSize: theme.textStyles["body-l"].fontSize,
    color: theme.colors.text,
    paddingVertical: theme.spacing[12],
  },
  error: { marginTop: theme.spacing[4] },
});
