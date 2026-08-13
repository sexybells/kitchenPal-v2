import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { COMMENT_TEXT_MAX } from "@kitchenpal/api-contract";
import { Input, Button } from "../../ui";
import { theme } from "../../theme";

export interface CommentInputProps {
  onSubmit: (text: string) => void;
  pending?: boolean;
  testID?: string;
}

/** Single-line composer for a flat comment; clears on submit. */
export function CommentInput({ onSubmit, pending, testID }: CommentInputProps) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const trimmed = text.trim();

  const submit = () => {
    if (!trimmed) return;
    onSubmit(trimmed);
    setText("");
  };

  return (
    <View style={styles.row}>
      <View style={styles.field}>
        <Input
          placeholder={t("community.commentPlaceholder")}
          value={text}
          onChangeText={setText}
          maxLength={COMMENT_TEXT_MAX}
          testID={testID}
        />
      </View>
      <Button
        label={t("community.send")}
        fullWidth={false}
        loading={pending}
        disabled={trimmed.length === 0}
        onPress={submit}
        testID={testID ? `${testID}-send` : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing[8],
  },
  field: { flex: 1 },
});
