import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Button, Card, Icon, Input, Text } from "../../ui";
import { theme } from "../../theme";
import { resolveErrorMessage } from "../../lib/error-message";
import { useAcceptInvite, useCreateHousehold } from "./hooks";

export interface HouseholdSetupProps {
  testID?: string;
}

/**
 * First-run entry for a user in personal mode (no household): create a new
 * household or join an existing one by invite code. Personal mode stays valid —
 * this is an opt-in, never forced.
 */
export function HouseholdSetup({ testID }: HouseholdSetupProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const create = useCreateHousehold();
  const accept = useAcceptInvite();

  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.intro}>
        <View style={styles.iconCircle}>
          <Icon name="household" size={32} color="primary" />
        </View>
        <Text variant="heading-m" color="text" center>
          {t("household.setupTitle")}
        </Text>
        <Text variant="body-m" color="text-muted" center>
          {t("household.setupBody")}
        </Text>
      </View>

      <Card style={styles.card}>
        <Text variant="heading-s" color="text">
          {t("household.createTitle")}
        </Text>
        <Input
          label={t("household.nameLabel")}
          value={name}
          onChangeText={setName}
          placeholder={t("household.namePlaceholder")}
          testID="household-name"
        />
        <Button
          label={t("household.createButton")}
          icon="plus"
          onPress={() => create.mutate({ name: name.trim() })}
          disabled={name.trim().length === 0 || create.isPending}
          loading={create.isPending}
          testID="household-create"
        />
        {create.isError ? (
          <Text variant="caption" color="danger">
            {resolveErrorMessage(create.error, t)}
          </Text>
        ) : null}
      </Card>

      <Card style={styles.card}>
        <Text variant="heading-s" color="text">
          {t("household.joinTitle")}
        </Text>
        <Input
          label={t("household.codeLabel")}
          value={code}
          onChangeText={setCode}
          placeholder={t("household.codePlaceholder")}
          autoCapitalize="characters"
          testID="household-code"
        />
        <Button
          label={t("household.joinButton")}
          icon="link"
          variant="secondary"
          onPress={() => accept.mutate(code.trim())}
          disabled={code.trim().length === 0 || accept.isPending}
          loading={accept.isPending}
          testID="household-join"
        />
        {accept.isError ? (
          <Text variant="caption" color="danger">
            {resolveErrorMessage(accept.error, t)}
          </Text>
        ) : null}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: theme.spacing[20] },
  intro: { alignItems: "center", gap: theme.spacing[8] },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: theme.radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors["primary-soft"],
    marginBottom: theme.spacing[4],
  },
  card: { gap: theme.spacing[12] },
});
