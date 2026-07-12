import { Share, StyleSheet, View } from "react-native";
import { setStringAsync } from "expo-clipboard";
import { useTranslation } from "react-i18next";
import { Button, Card, Icon, Text } from "../../ui";
import { theme } from "../../theme";
import type { HouseholdInviteResponse } from "@kitchenpal/api-contract";

export interface InviteCardProps {
  /** The newest pending invite, or null when none is active. */
  invite: HouseholdInviteResponse | null;
  canManage: boolean;
  onCreate: () => void;
  onRevoke: (invite: HouseholdInviteResponse) => void;
  creating?: boolean;
  testID?: string;
}

/**
 * Invite panel: shows the active code with copy + share actions and lets
 * owners/admins generate or revoke it. Members without an active code (or
 * without manage rights) see the appropriate state.
 */
export function InviteCard({
  invite,
  canManage,
  onCreate,
  onRevoke,
  creating = false,
  testID,
}: InviteCardProps) {
  const { t } = useTranslation();

  const copy = () => {
    if (invite) void setStringAsync(invite.code);
  };
  const share = () => {
    if (invite) {
      void Share.share({ message: t("household.inviteShareText", { code: invite.code }) });
    }
  };

  return (
    <Card testID={testID} style={styles.card}>
      <View style={styles.header}>
        <Icon name="link" size={20} color="primary" />
        <Text variant="heading-s" color="text">
          {t("household.inviteTitle")}
        </Text>
      </View>

      {invite ? (
        <>
          <Text variant="body-m" color="text-muted">
            {t("household.inviteBody")}
          </Text>
          <View style={styles.codeRow}>
            <Text variant="display-m" color="primary" testID="invite-code">
              {invite.code}
            </Text>
          </View>
          <View style={styles.actions}>
            <View style={styles.actionItem}>
              <Button
                label={t("household.copyCode")}
                variant="secondary"
                icon="check"
                onPress={copy}
                testID="invite-copy"
              />
            </View>
            <View style={styles.actionItem}>
              <Button
                label={t("household.shareInvite")}
                icon="link"
                onPress={share}
                testID="invite-share"
              />
            </View>
          </View>
          {canManage ? (
            <Button
              label={t("household.revokeInvite")}
              variant="ghost"
              onPress={() => onRevoke(invite)}
              testID="invite-revoke"
            />
          ) : null}
        </>
      ) : (
        <>
          <Text variant="body-m" color="text-muted">
            {canManage ? t("household.noInviteBody") : t("household.noInviteMember")}
          </Text>
          {canManage ? (
            <Button
              label={t("household.createInvite")}
              icon="plus"
              onPress={onCreate}
              loading={creating}
              testID="invite-create"
            />
          ) : null}
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: theme.spacing[12] },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[8],
  },
  codeRow: {
    alignItems: "center",
    paddingVertical: theme.spacing[12],
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors["primary-soft"],
  },
  actions: { flexDirection: "row", gap: theme.spacing[12] },
  actionItem: { flex: 1 },
});
