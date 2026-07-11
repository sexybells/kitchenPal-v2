import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Screen, Text, Button, Input, Icon } from "../../src/ui";
import { theme } from "../../src/theme";
import { useForgotPassword } from "../../src/api/hooks";
import { resolveErrorMessage } from "../../src/lib/error-message";

/** Password Recovery — request a reset link by email. */
export default function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const forgot = useForgotPassword();
  const [email, setEmail] = useState("");

  const submit = () => {
    forgot.mutate({ email: email.trim() });
  };

  const errorMessage = resolveErrorMessage(forgot.error, t);

  return (
    <Screen>
      <View style={styles.top}>
        <Button
          label={t("common.back")}
          variant="ghost"
          fullWidth={false}
          icon="chevron-left"
          onPress={() => router.back()}
        />
      </View>

      <View style={styles.header}>
        <Text variant="display-m" color="text">
          {t("auth.recoverTitle")}
        </Text>
        <Text variant="body-l" color="text-muted">
          {t("auth.recoverSubtitle")}
        </Text>
      </View>

      {forgot.isSuccess ? (
        <View style={styles.success} testID="forgot-success">
          <Icon name="check" size={28} color="success" />
          <Text variant="body-l" color="text" center>
            {t("auth.resetSent")}
          </Text>
          <Button label={t("auth.login")} onPress={() => router.replace("/(auth)/login")} />
        </View>
      ) : (
        <View style={styles.form}>
          <Input
            label={t("common.email")}
            leftIcon="mail"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            testID="forgot-email"
          />
          {errorMessage ? (
            <Text variant="body-m" color="danger" testID="forgot-error">
              {errorMessage}
            </Text>
          ) : null}
          <Button
            label={t("auth.sendResetLink")}
            loading={forgot.isPending}
            onPress={submit}
            testID="forgot-submit"
          />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { alignItems: "flex-start", paddingTop: theme.spacing[8] },
  header: { gap: theme.spacing[8], marginTop: theme.spacing[16] },
  form: { gap: theme.spacing[16], marginTop: theme.spacing[28] },
  success: {
    gap: theme.spacing[16],
    marginTop: theme.spacing[32],
    alignItems: "center",
  },
});
