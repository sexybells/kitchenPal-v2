import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Screen, Text, Button, Icon, LoadingState } from "../src/ui";
import { theme } from "../src/theme";
import { useCreateScan } from "../src/features/pantry/hooks";
import {
  captureFromCamera,
  pickFromLibrary,
  type ImageRequest,
} from "../src/features/pantry/image-source";
import { resolveErrorMessage } from "../src/lib/error-message";

/** Scan entry — capture or pick a photo, upload it, then open the review. */
export default function ScanScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const createScan = useCreateScan();
  const [denied, setDenied] = useState(false);

  const handle = async (request: Promise<ImageRequest>) => {
    setDenied(false);
    const result = await request;
    if (result.status === "denied") {
      setDenied(true);
      return;
    }
    if (result.status === "cancelled") return;
    createScan.mutate(result.source, {
      onSuccess: (scan) => router.replace(`/scan-review?scanId=${scan.id}`),
    });
  };

  const error = resolveErrorMessage(createScan.error, t);

  if (createScan.isPending) {
    return (
      <Screen>
        <LoadingState label={t("scan.uploading")} testID="scan-uploading" />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.iconCircle}>
          <Icon name="scan" size={32} color="primary" />
        </View>
        <Text variant="heading-l" color="text" center>
          {t("scan.title")}
        </Text>
        <Text variant="body-m" color="text-muted" center>
          {t("scan.intro")}
        </Text>
      </View>

      <View style={styles.actions}>
        <Button
          label={t("scan.takePhoto")}
          icon="scan"
          onPress={() => handle(captureFromCamera())}
          testID="scan-camera"
        />
        <Button
          label={t("scan.chooseLibrary")}
          variant="secondary"
          onPress={() => handle(pickFromLibrary())}
          testID="scan-library"
        />
      </View>

      {denied ? (
        <View style={styles.notice} testID="scan-denied">
          <Text variant="label-m" color="text">
            {t("scan.permissionTitle")}
          </Text>
          <Text variant="body-m" color="text-muted">
            {t("scan.permissionBody")}
          </Text>
        </View>
      ) : null}

      {error ? (
        <Text variant="body-m" color="danger" center style={styles.error} testID="scan-error">
          {error}
        </Text>
      ) : null}

      <View style={styles.manualLink}>
        <Button
          label={t("scan.addManual")}
          variant="ghost"
          onPress={() => router.replace("/pantry-item")}
          testID="scan-manual"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: "center",
    gap: theme.spacing[12],
    paddingTop: theme.spacing[24],
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: theme.radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors["primary-soft"],
    marginBottom: theme.spacing[4],
  },
  actions: { gap: theme.spacing[12], marginTop: theme.spacing[32] },
  notice: {
    gap: theme.spacing[4],
    marginTop: theme.spacing[24],
    padding: theme.spacing[16],
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors["warning-soft"],
  },
  error: { marginTop: theme.spacing[16] },
  manualLink: { marginTop: theme.spacing[16], alignItems: "center" },
});
