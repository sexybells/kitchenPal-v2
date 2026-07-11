import { ActivityIndicator, StyleSheet, View } from "react-native";
import { theme } from "../theme";
import { Text } from "./Text";
import { Button } from "./Button";
import { Icon, type IconName } from "./icons/Icon";

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing[32],
    gap: theme.spacing[12],
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: theme.radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors["surface-alt"],
    marginBottom: theme.spacing[4],
  },
  action: { marginTop: theme.spacing[8], alignSelf: "stretch" },
});

export interface LoadingStateProps {
  label?: string;
  testID?: string;
}

/** Centered spinner for full-screen/section loading. */
export function LoadingState({ label, testID }: LoadingStateProps) {
  return (
    <View style={styles.center} testID={testID}>
      <ActivityIndicator size="large" color={theme.colors.primary} />
      {label ? (
        <Text variant="body-m" color="text-muted" center>
          {label}
        </Text>
      ) : null}
    </View>
  );
}

export interface EmptyStateProps {
  title: string;
  body?: string;
  icon?: IconName;
  testID?: string;
}

/** Illustration-light empty state with an optional icon. */
export function EmptyState({ title, body, icon = "leaf", testID }: EmptyStateProps) {
  return (
    <View style={styles.center} testID={testID}>
      <View style={styles.iconCircle}>
        <Icon name={icon} size={32} color="text-subtle" />
      </View>
      <Text variant="heading-s" color="text" center>
        {title}
      </Text>
      {body ? (
        <Text variant="body-m" color="text-muted" center>
          {body}
        </Text>
      ) : null}
    </View>
  );
}

export interface ErrorStateProps {
  title: string;
  body?: string;
  retryLabel?: string;
  onRetry?: () => void;
  testID?: string;
}

/** Error state with an optional retry action. */
export function ErrorState({
  title,
  body,
  retryLabel,
  onRetry,
  testID,
}: ErrorStateProps) {
  return (
    <View style={styles.center} testID={testID}>
      <View style={styles.iconCircle}>
        <Icon name="alert" size={32} color="danger" />
      </View>
      <Text variant="heading-s" color="text" center>
        {title}
      </Text>
      {body ? (
        <Text variant="body-m" color="text-muted" center>
          {body}
        </Text>
      ) : null}
      {onRetry && retryLabel ? (
        <View style={styles.action}>
          <Button label={retryLabel} variant="secondary" onPress={onRetry} />
        </View>
      ) : null}
    </View>
  );
}
