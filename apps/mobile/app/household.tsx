import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  Badge,
  Button,
  Card,
  Icon,
  LoadingState,
  ErrorState,
  Screen,
  Text,
} from "../src/ui";
import { theme } from "../src/theme";
import { resolveErrorMessage } from "../src/lib/error-message";
import { useSessionStore } from "../src/store/session";
import type { HouseholdMemberResponse } from "@kitchenpal/api-contract";
import {
  useHouseholds,
  useMembers,
  useInvites,
  useCreateInvite,
  useRevokeInvite,
  useUpdateMemberRole,
  useRemoveMember,
  useLeaveOrDeleteHousehold,
} from "../src/features/household/hooks";
import { canManageMembers, roleLabel, roleTone } from "../src/features/household/roles";
import { HouseholdSetup } from "../src/features/household/HouseholdSetup";
import { InviteCard } from "../src/features/household/InviteCard";
import { MemberRow } from "../src/features/household/MemberRow";

/**
 * Household hub: the household card, invite panel, member list with role
 * management (owner/admin), a link into the realtime chat, and leave/delete.
 * A user with no household sees the create/join setup (personal mode is
 * first-class — joining a household is opt-in).
 */
export default function HouseholdScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const currentUserId = useSessionStore((state) => state.user?.id);

  const households = useHouseholds();
  const household = households.data?.[0];
  const householdId = household?.id;

  const members = useMembers(householdId);
  const invites = useInvites(householdId);

  const createInvite = useCreateInvite(householdId ?? "");
  const revokeInvite = useRevokeInvite(householdId ?? "");
  const updateRole = useUpdateMemberRole(householdId ?? "");
  const removeMember = useRemoveMember(householdId ?? "");
  const leaveOrDelete = useLeaveOrDeleteHousehold();

  if (households.isLoading) {
    return (
      <Screen testID="household-screen">
        <Header title={t("menu.household")} />
        <LoadingState label={t("common.loading")} />
      </Screen>
    );
  }

  if (households.isError) {
    return (
      <Screen testID="household-screen">
        <Header title={t("menu.household")} />
        <ErrorState
          title={t("states.errorTitle")}
          body={resolveErrorMessage(households.error, t) ?? t("states.errorBody")}
          retryLabel={t("common.retry")}
          onRetry={() => households.refetch()}
          testID="household-error"
        />
      </Screen>
    );
  }

  if (!household || !householdId) {
    return (
      <Screen testID="household-screen">
        <Header title={t("menu.household")} />
        <HouseholdSetup testID="household-setup" />
      </Screen>
    );
  }

  const activeMembers = (members.data ?? []).filter(
    (m) => m.status === "active",
  );
  const activeInvite =
    [...(invites.data ?? [])]
      .filter((invite) => invite.status === "pending")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
  const canManage = canManageMembers(household.myRole);
  const isOwner = household.myRole === "owner";
  const selfMember = activeMembers.find((m) => m.userId === currentUserId);

  const changeRole = (
    member: HouseholdMemberResponse,
    next: "admin" | "member",
  ) => updateRole.mutate({ memberId: member.id, input: { role: next } });

  return (
    <Screen testID="household-screen">
      <Header title={t("menu.household")} />

      <Card testID="household-card" style={styles.headerCard}>
        <View style={styles.householdRow}>
          <View style={styles.avatarCircle}>
            <Icon name="household" size={26} color="primary" />
          </View>
          <View style={styles.householdInfo}>
            <Text variant="heading-m" color="text" numberOfLines={1}>
              {household.name}
            </Text>
            <Text variant="body-m" color="text-muted">
              {t("household.memberCount", { count: household.membersCount })}
            </Text>
          </View>
          <Badge label={roleLabel(t, household.myRole)} tone={roleTone(household.myRole)} />
        </View>
        <Button
          label={t("household.openChat")}
          icon="users"
          onPress={() =>
            router.push({ pathname: "/chat", params: { householdId } })
          }
          testID="household-open-chat"
        />
      </Card>

      <InviteCard
        invite={activeInvite}
        canManage={canManage}
        onCreate={() => createInvite.mutate({ ttlHours: 72 })}
        onRevoke={(invite) => revokeInvite.mutate(invite.id)}
        creating={createInvite.isPending}
        testID="household-invite"
      />

      <Section title={t("household.membersTitle")}>
        {members.isLoading ? (
          <LoadingState />
        ) : (
          <Card>
            {activeMembers.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                actorRole={household.myRole}
                isSelf={member.userId === currentUserId}
                onChangeRole={changeRole}
                onRemove={(target) => removeMember.mutate(target.id)}
                testID={`member-${member.id}`}
              />
            ))}
          </Card>
        )}
      </Section>

      <View style={styles.dangerZone}>
        {isOwner ? (
          <Button
            label={t("household.deleteHousehold")}
            variant="secondary"
            onPress={() => leaveOrDelete.mutate(householdId)}
            loading={leaveOrDelete.isPending}
            testID="household-delete"
          />
        ) : selfMember ? (
          <Button
            label={t("household.leaveHousehold")}
            variant="secondary"
            onPress={() => removeMember.mutate(selfMember.id)}
            loading={removeMember.isPending}
            testID="household-leave"
          />
        ) : null}
      </View>
    </Screen>
  );
}

function Header({ title }: { title: string }) {
  return (
    <View style={styles.header}>
      <Text variant="heading-l" color="text">
        {title}
      </Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="heading-s" color="text">
        {title}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: theme.spacing[8], marginBottom: theme.spacing[16] },
  headerCard: { gap: theme.spacing[16] },
  householdRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[12],
  },
  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors["primary-soft"],
    alignItems: "center",
    justifyContent: "center",
  },
  householdInfo: { flex: 1, gap: theme.spacing[4] },
  section: { marginTop: theme.spacing[24], gap: theme.spacing[12] },
  dangerZone: { marginTop: theme.spacing[32] },
});
