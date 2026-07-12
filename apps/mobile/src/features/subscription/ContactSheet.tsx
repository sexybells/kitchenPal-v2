import { Modal, Pressable, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Text, Button, Icon } from "../../ui";
import { theme } from "../../theme";

export interface ContactSheetProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * Informational bottom sheet shown after the (inert) upgrade request. It makes
 * the v1 monetization model explicit — Pro is granted manually via contact, and
 * no payment is taken in the app — so the Paywall CTA never implies a purchase.
 */
export function ContactSheet({ visible, onClose }: ContactSheetProps) {
  const { t } = useTranslation();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t("common.close")}
      />
      <View style={styles.sheet} testID="paywall-contact-sheet">
        <View style={styles.iconCircle}>
          <Icon name="sparkles" size={28} color="primary" />
        </View>
        <Text variant="heading-s" color="text" center>
          {t("paywall.contactTitle")}
        </Text>
        <Text variant="body-m" color="text-muted" center>
          {t("paywall.contactBody")}
        </Text>
        <Button
          label={t("paywall.contactDismiss")}
          onPress={onClose}
          testID="paywall-contact-dismiss"
        />
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
    padding: theme.spacing[24],
    gap: theme.spacing[12],
    alignItems: "center",
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors["primary-soft"],
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.spacing[4],
  },
});
