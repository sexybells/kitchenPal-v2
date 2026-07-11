import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Screen, Text, Button, Input } from "../../src/ui";
import { SocialAuthButtons } from "../../src/features/auth/SocialAuthButtons";
import { theme } from "../../src/theme";
import { useLogin } from "../../src/api/hooks";
import { resolveErrorMessage } from "../../src/lib/error-message";
import { isBiometricAvailable, authenticateWithBiometrics } from "../../src/lib/biometrics";
import { useSessionStore } from "../../src/store/session";

/** Login — email/password + Google/Apple + biometric unlock. */
export default function LoginScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const login = useLogin();
  const hydrate = useSessionStore((state) => state.hydrate);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [biometricReady, setBiometricReady] = useState(false);

  useEffect(() => {
    let active = true;
    void isBiometricAvailable().then((available) => {
      if (active) setBiometricReady(available);
    });
    return () => {
      active = false;
    };
  }, []);

  const submit = () => {
    login.mutate({ email: email.trim(), password });
  };

  const onBiometric = async () => {
    const ok = await authenticateWithBiometrics(t("auth.unlockWithBiometrics"));
    if (ok) await hydrate();
  };

  const errorMessage = resolveErrorMessage(login.error, t);

  return (
    <Screen>
      <View style={styles.header}>
        <Text variant="display-m" color="text">
          {t("auth.loginTitle")}
        </Text>
        <Text variant="body-l" color="text-muted">
          {t("auth.loginSubtitle")}
        </Text>
      </View>

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
          testID="login-email"
        />
        <Input
          label={t("common.password")}
          leftIcon="lock"
          secure
          value={password}
          onChangeText={setPassword}
          autoComplete="password"
          textContentType="password"
          testID="login-password"
        />

        {errorMessage ? (
          <Text variant="body-m" color="danger" testID="login-error">
            {errorMessage}
          </Text>
        ) : null}

        <Button
          label={t("auth.forgotPassword")}
          variant="ghost"
          fullWidth={false}
          onPress={() => router.push("/(auth)/forgot-password")}
        />

        <Button
          label={t("auth.login")}
          loading={login.isPending}
          onPress={submit}
          testID="login-submit"
        />
      </View>

      <SocialAuthButtons
        showBiometric={biometricReady}
        onBiometric={onBiometric}
        disabled={login.isPending}
      />

      <View style={styles.footer}>
        <Text variant="body-m" color="text-muted">
          {t("auth.noAccount")}{" "}
        </Text>
        <Button
          label={t("auth.signUp")}
          variant="ghost"
          fullWidth={false}
          onPress={() => router.replace("/(auth)/sign-up")}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: theme.spacing[8], paddingTop: theme.spacing[24] },
  form: { gap: theme.spacing[16], marginTop: theme.spacing[28] },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: theme.spacing[24],
  },
});
