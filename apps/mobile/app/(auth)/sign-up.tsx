import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Screen, Text, Button, Input } from "../../src/ui";
import { SocialAuthButtons } from "../../src/features/auth/SocialAuthButtons";
import { useAppleAuth } from "../../src/features/auth/apple-auth";
import { theme } from "../../src/theme";
import { useRegister } from "../../src/api/hooks";
import { resolveErrorMessage } from "../../src/lib/error-message";
import { useUiStore } from "../../src/store/ui";

/** Sign Up — create an email/password account (locale sent from UI store). */
export default function SignUpScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const register = useRegister();
  const apple = useAppleAuth();
  const locale = useUiStore((state) => state.locale);

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const submit = () => {
    register.mutate({
      displayName: displayName.trim(),
      email: email.trim(),
      password,
      locale,
    });
  };

  const errorMessage = resolveErrorMessage(register.error, t) ?? apple.error;

  return (
    <Screen>
      <View style={styles.header}>
        <Text variant="display-m" color="text">
          {t("auth.signUpTitle")}
        </Text>
        <Text variant="body-l" color="text-muted">
          {t("auth.signUpSubtitle")}
        </Text>
      </View>

      <View style={styles.form}>
        <Input
          label={t("common.displayName")}
          leftIcon="user"
          value={displayName}
          onChangeText={setDisplayName}
          autoCapitalize="words"
          autoComplete="name"
          testID="signup-name"
        />
        <Input
          label={t("common.email")}
          leftIcon="mail"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          textContentType="emailAddress"
          testID="signup-email"
        />
        <Input
          label={t("common.password")}
          leftIcon="lock"
          secure
          value={password}
          onChangeText={setPassword}
          autoComplete="password-new"
          textContentType="newPassword"
          testID="signup-password"
        />

        {errorMessage ? (
          <Text variant="body-m" color="danger" testID="signup-error">
            {errorMessage}
          </Text>
        ) : null}

        <Button
          label={t("auth.signUp")}
          loading={register.isPending}
          onPress={submit}
          testID="signup-submit"
        />
      </View>

      <SocialAuthButtons
        onApple={apple.signIn}
        disabled={register.isPending || apple.isPending}
      />

      <View style={styles.footer}>
        <Text variant="body-m" color="text-muted">
          {t("auth.haveAccount")}{" "}
        </Text>
        <Button
          label={t("auth.login")}
          variant="ghost"
          fullWidth={false}
          onPress={() => router.replace("/(auth)/login")}
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
