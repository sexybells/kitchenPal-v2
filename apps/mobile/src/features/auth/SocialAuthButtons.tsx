import { Platform, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { theme } from "../../theme";
import { Button } from "../../ui/Button";
import { Text } from "../../ui/Text";

export interface SocialAuthButtonsProps {
  onGoogle?: () => void;
  onApple?: () => void;
  onBiometric?: () => void;
  /** Only shown when biometric unlock is available on the device. */
  showBiometric?: boolean;
  disabled?: boolean;
}

/**
 * Google / Apple / biometric entry points shared by Login and Sign Up. Apple is
 * iOS-only; the biometric button is rendered only when the device supports it
 * (the caller checks availability via `lib/biometrics`).
 */
export function SocialAuthButtons({
  onGoogle,
  onApple,
  onBiometric,
  showBiometric = false,
  disabled = false,
}: SocialAuthButtonsProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.wrapper}>
      <View style={styles.divider}>
        <View style={styles.line} />
        <Text variant="caption" color="text-subtle">
          {t("common.or")}
        </Text>
        <View style={styles.line} />
      </View>

      <Button
        label={t("auth.continueWithGoogle")}
        variant="secondary"
        icon="google"
        onPress={onGoogle}
        disabled={disabled}
      />
      {Platform.OS === "ios" ? (
        <Button
          label={t("auth.continueWithApple")}
          variant="secondary"
          icon="apple"
          onPress={onApple}
          disabled={disabled}
        />
      ) : null}
      {showBiometric ? (
        <Button
          label={t("auth.unlockWithBiometrics")}
          variant="ghost"
          icon="fingerprint"
          onPress={onBiometric}
          disabled={disabled}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: theme.spacing[12] },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[12],
    paddingVertical: theme.spacing[4],
  },
  line: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors["border-strong"],
  },
});
