import { useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Icon } from "../../ui";
import { fontFamilyForWeight, theme } from "../../theme";

export interface ChatInputBarProps {
  onSend: (text: string) => void;
  onAttachImage: () => void;
  onCreatePoll: () => void;
  /** Called as the caller types, to emit the typing signal. */
  onTyping?: () => void;
  disabled?: boolean;
  testID?: string;
}

/**
 * Chat composer: image attach, poll, a growing text field, and a send button.
 * Send is disabled until there is non-whitespace text; the field clears on send.
 */
export function ChatInputBar({
  onSend,
  onAttachImage,
  onCreatePoll,
  onTyping,
  disabled = false,
  testID,
}: ChatInputBarProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const canSend = value.trim().length > 0 && !disabled;

  const submit = () => {
    if (!canSend) return;
    onSend(value);
    setValue("");
  };

  return (
    <View style={styles.bar} testID={testID}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("chat.createPoll")}
        onPress={onCreatePoll}
        disabled={disabled}
        hitSlop={8}
        style={styles.iconButton}
        testID={testID ? `${testID}-poll` : undefined}
      >
        <Icon name="users" size={22} color="text-muted" />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("chat.attachImage")}
        onPress={onAttachImage}
        disabled={disabled}
        hitSlop={8}
        style={styles.iconButton}
        testID={testID ? `${testID}-attach` : undefined}
      >
        <Icon name="camera" size={22} color="text-muted" />
      </Pressable>

      <TextInput
        style={styles.input}
        value={value}
        onChangeText={(next) => {
          setValue(next);
          onTyping?.();
        }}
        placeholder={t("chat.inputPlaceholder")}
        placeholderTextColor={theme.colors["text-subtle"]}
        multiline
        editable={!disabled}
        testID={testID ? `${testID}-field` : undefined}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("chat.send")}
        accessibilityState={{ disabled: !canSend }}
        onPress={submit}
        disabled={!canSend}
        style={[styles.send, canSend ? null : styles.sendDisabled]}
        testID={testID ? `${testID}-send` : undefined}
      >
        <Icon name="chevron-right" size={22} color="text-inverse" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: theme.spacing[8],
    paddingVertical: theme.spacing[8],
  },
  iconButton: { paddingBottom: theme.spacing[8] },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 44,
    borderRadius: theme.radius.xl,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing[16],
    paddingTop: theme.spacing[12],
    paddingBottom: theme.spacing[12],
    fontFamily: fontFamilyForWeight(theme.fontWeight.regular),
    fontSize: theme.textStyles["body-m"].fontSize,
    color: theme.colors.text,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendDisabled: { opacity: 0.4 },
});
