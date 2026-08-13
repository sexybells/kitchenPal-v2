import { Modal, Pressable, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Text, Icon, type IconName } from "../../ui";
import { theme, type ColorToken } from "../../theme";

export interface SheetAction {
  key: string;
  label: string;
  icon?: IconName;
  /** `danger` tints the row for destructive actions (delete/block). */
  tone?: "default" | "danger";
  onPress: () => void;
}

export interface ActionSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  actions: SheetAction[];
  testID?: string;
}

/** Bottom-sheet list of tappable actions (the post/comment "…" menu). */
export function ActionSheet({
  visible,
  onClose,
  title,
  actions,
  testID,
}: ActionSheetProps) {
  const { t } = useTranslation();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t("common.close")}
      />
      <View style={styles.sheet} testID={testID}>
        {title ? (
          <Text variant="label-s" color="text-muted" style={styles.title}>
            {title}
          </Text>
        ) : null}
        {actions.map((action) => {
          const tone: ColorToken =
            action.tone === "danger" ? "danger" : "text";
          return (
            <Pressable
              key={action.key}
              onPress={action.onPress}
              accessibilityRole="button"
              style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
              testID={`action-${action.key}`}
            >
              {action.icon ? (
                <Icon name={action.icon} size={20} color={tone} />
              ) : null}
              <Text variant="title" color={tone}>
                {action.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(43, 36, 32, 0.4)" },
  sheet: {
    backgroundColor: theme.colors.bg,
    borderTopLeftRadius: theme.radius["2xl"],
    borderTopRightRadius: theme.radius["2xl"],
    padding: theme.spacing[20],
    gap: theme.spacing[4],
  },
  title: { marginBottom: theme.spacing[8] },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[12],
    paddingVertical: theme.spacing[12],
  },
  pressed: { opacity: 0.6 },
});
