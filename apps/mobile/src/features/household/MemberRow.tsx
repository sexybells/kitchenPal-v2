import { Pressable, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Avatar, Badge, Icon, Text } from "../../ui";
import { theme } from "../../theme";
import type { HouseholdMemberResponse } from "@kitchenpal/api-contract";
import { canChangeRole, roleLabel, roleTone } from "./roles";

export interface MemberRowProps {
  member: HouseholdMemberResponse;
  /** The viewing member's role — gates the management controls. */
  actorRole: HouseholdMemberResponse["role"];
  /** True when this row is the viewer's own membership. */
  isSelf: boolean;
  onChangeRole: (member: HouseholdMemberResponse, next: "admin" | "member") => void;
  onRemove: (member: HouseholdMemberResponse) => void;
  testID?: string;
}

/**
 * One household member: avatar, name, role badge. Owners/admins get inline
 * controls to promote/demote and remove other members; the owner and the
 * viewer's own row are never manageable here (self-leave lives on the screen).
 */
export function MemberRow({
  member,
  actorRole,
  isSelf,
  onChangeRole,
  onRemove,
  testID,
}: MemberRowProps) {
  const { t } = useTranslation();
  const manageable =
    !isSelf && canChangeRole(actorRole, member.role) && member.status === "active";
  const nextRole = member.role === "admin" ? "member" : "admin";

  return (
    <View style={styles.row} testID={testID}>
      <Avatar name={member.displayName} uri={member.avatarUrl} size={44} />
      <View style={styles.body}>
        <Text variant="title" color="text" numberOfLines={1}>
          {isSelf ? t("household.youSuffix", { name: member.displayName }) : member.displayName}
        </Text>
        <Badge label={roleLabel(t, member.role)} tone={roleTone(member.role)} />
      </View>

      {manageable ? (
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              nextRole === "admin"
                ? t("household.promote")
                : t("household.demote")
            }
            onPress={() => onChangeRole(member, nextRole)}
            hitSlop={8}
            style={styles.action}
            testID={testID ? `${testID}-role` : undefined}
          >
            <Icon
              name={nextRole === "admin" ? "star" : "user"}
              size={20}
              color="secondary"
            />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("household.removeMember")}
            onPress={() => onRemove(member)}
            hitSlop={8}
            style={styles.action}
            testID={testID ? `${testID}-remove` : undefined}
          >
            <Icon name="close" size={20} color="danger" />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[12],
    paddingVertical: theme.spacing[12],
  },
  body: { flex: 1, gap: theme.spacing[4], alignItems: "flex-start" },
  actions: { flexDirection: "row", gap: theme.spacing[8] },
  action: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors["surface-alt"],
    alignItems: "center",
    justifyContent: "center",
  },
});
