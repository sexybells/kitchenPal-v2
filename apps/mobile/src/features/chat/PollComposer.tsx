import { useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Button, Icon, Input, Text } from "../../ui";
import { theme } from "../../theme";

export interface PollComposerProps {
  visible: boolean;
  onClose: () => void;
  onCreate: (question: string, options: string[]) => void;
  submitting?: boolean;
}

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 10;

/**
 * Modal to compose a recipe vote poll: a question and 2–10 options. "Create" is
 * enabled once the question and at least two options are filled.
 */
export function PollComposer({
  visible,
  onClose,
  onCreate,
  submitting = false,
}: PollComposerProps) {
  const { t } = useTranslation();
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);

  const filled = options.map((o) => o.trim()).filter((o) => o.length > 0);
  const canCreate =
    question.trim().length > 0 && filled.length >= MIN_OPTIONS && !submitting;

  const reset = () => {
    setQuestion("");
    setOptions(["", ""]);
  };

  const close = () => {
    reset();
    onClose();
  };

  const submit = () => {
    if (!canCreate) return;
    onCreate(question.trim(), filled);
    reset();
  };

  const setOption = (index: number, next: string) =>
    setOptions((current) => current.map((o, i) => (i === index ? next : o)));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={close}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text variant="heading-s" color="text">
              {t("chat.poll.title")}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("common.close")}
              onPress={close}
              hitSlop={8}
            >
              <Icon name="close" size={22} color="text-muted" />
            </Pressable>
          </View>

          <Input
            label={t("chat.poll.question")}
            value={question}
            onChangeText={setQuestion}
            placeholder={t("chat.poll.questionPlaceholder")}
            testID="poll-question"
          />

          <View style={styles.options}>
            {options.map((option, index) => (
              <Input
                // Option position is stable; index keying is intentional here.
                key={`option-${index}`}
                value={option}
                onChangeText={(next) => setOption(index, next)}
                placeholder={t("chat.poll.optionPlaceholder", {
                  number: index + 1,
                })}
                testID={`poll-option-${index}`}
              />
            ))}
          </View>

          {options.length < MAX_OPTIONS ? (
            <Button
              label={t("chat.poll.addOption")}
              variant="ghost"
              icon="plus"
              onPress={() => setOptions((current) => [...current, ""])}
            />
          ) : null}

          <Button
            label={t("chat.poll.create")}
            onPress={submit}
            disabled={!canCreate}
            loading={submitting}
            testID="poll-create"
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(43, 36, 32, 0.4)",
  },
  sheet: {
    backgroundColor: theme.colors.bg,
    borderTopLeftRadius: theme.radius["2xl"],
    borderTopRightRadius: theme.radius["2xl"],
    padding: theme.spacing[20],
    gap: theme.spacing[16],
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  options: { gap: theme.spacing[8] },
});
