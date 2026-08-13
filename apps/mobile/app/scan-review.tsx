import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  Screen,
  ScreenHeader,
  Text,
  Button,
  Icon,
  LoadingState,
  ErrorState,
} from "../src/ui";
import { theme } from "../src/theme";
import { useScan, useConfirmScan } from "../src/features/pantry/hooks";
import {
  ScanReviewRow,
  type ReviewRow,
} from "../src/features/pantry/ScanReviewRow";
import {
  detectionToRow,
  emptyRow,
  rowsToConfirmInput,
} from "../src/features/pantry/scan-review-model";
import { resolveErrorMessage } from "../src/lib/error-message";

/**
 * AI review: poll the scan, present editable detections, and confirm them into
 * the pantry. When the scan degraded (no AI / empty detections) it guides the
 * user to add items manually instead of showing fabricated detections.
 */
export default function ScanReviewScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { scanId } = useLocalSearchParams<{ scanId?: string }>();
  const scan = useScan(scanId ?? null);
  const confirm = useConfirmScan();

  const [rows, setRows] = useState<ReviewRow[]>([]);
  const seeded = useRef(false);

  // Seed the editable rows once the scan reaches a terminal (non-pending) state.
  useEffect(() => {
    if (seeded.current || !scan.data || scan.data.status === "pending") return;
    seeded.current = true;
    setRows(scan.data.detections.map(detectionToRow));
  }, [scan.data]);

  const updateRow = (next: ReviewRow) =>
    setRows((prev) => prev.map((row) => (row.key === next.key ? next : row)));
  const removeRow = (key: string) =>
    setRows((prev) => prev.filter((row) => row.key !== key));
  const addRow = () => setRows((prev) => [...prev, emptyRow()]);

  const onConfirm = () => {
    if (!scanId) return;
    const input = rowsToConfirmInput(rows);
    if (input.items.length === 0) return;
    confirm.mutate({ id: scanId, input }, { onSuccess: () => router.replace("/pantry") });
  };

  if (!scanId) {
    return (
      <Screen>
        <ScreenHeader title={t("scan.reviewTitle")} onBack={() => router.back()} />
        <ErrorState title={t("scan.failedTitle")} body={t("scan.failedBody")} />
      </Screen>
    );
  }

  if (scan.isLoading || scan.data?.status === "pending") {
    return (
      <Screen>
        <ScreenHeader title={t("scan.reviewTitle")} onBack={() => router.back()} />
        <LoadingState label={t("scan.analyzing")} testID="scan-analyzing" />
      </Screen>
    );
  }

  if (scan.isError || scan.data?.status === "failed") {
    return (
      <Screen>
        <ScreenHeader title={t("scan.reviewTitle")} onBack={() => router.back()} />
        <ErrorState
          title={t("scan.failedTitle")}
          body={resolveErrorMessage(scan.error, t) ?? t("scan.failedBody")}
          retryLabel={t("common.retry")}
          onRetry={() => scan.refetch()}
          testID="scan-review-error"
        />
      </Screen>
    );
  }

  const degraded = scan.data?.degraded || scan.data?.detections.length === 0;
  const confirmItems = rowsToConfirmInput(rows).items;

  return (
    <Screen
      footer={
        <View style={styles.footer}>
          {confirm.error ? (
            <Text variant="body-m" color="danger" center testID="review-error">
              {resolveErrorMessage(confirm.error, t)}
            </Text>
          ) : null}
          <Button
            label={t("scan.confirm")}
            loading={confirm.isPending}
            disabled={confirmItems.length === 0}
            onPress={onConfirm}
            testID="review-confirm"
          />
        </View>
      }
    >
      <ScreenHeader title={t("scan.reviewTitle")} onBack={() => router.back()} />
      <Text variant="body-m" color="text-muted">
        {t("scan.reviewSubtitle")}
      </Text>

      {degraded ? (
        <View style={styles.degradeBanner} testID="scan-degraded">
          <View style={styles.degradeIcon}>
            <Icon name="alert" size={22} color="warning" />
          </View>
          <View style={styles.degradeText}>
            <Text variant="label-m" color="text">
              {t("scan.degradedTitle")}
            </Text>
            <Text variant="body-m" color="text-muted">
              {t("scan.degradedBody")}
            </Text>
          </View>
        </View>
      ) : null}

      <View style={styles.list}>
        {rows.map((row) => (
          <ScanReviewRow
            key={row.key}
            row={row}
            onChange={updateRow}
            onRemove={() => removeRow(row.key)}
            testID={`review-row-${row.key}`}
          />
        ))}
        {rows.length === 0 ? (
          <Text variant="body-m" color="text-muted" center style={styles.emptyHint}>
            {t("scan.emptyReview")}
          </Text>
        ) : null}
      </View>

      <View style={styles.addRow}>
        <Button
          label={t("scan.addManual")}
          variant="secondary"
          icon="plus"
          onPress={addRow}
          testID="review-add"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  degradeBanner: {
    flexDirection: "row",
    gap: theme.spacing[12],
    padding: theme.spacing[16],
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors["warning-soft"],
    marginTop: theme.spacing[16],
  },
  degradeIcon: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface,
  },
  degradeText: { flex: 1, gap: theme.spacing[4] },
  list: {
    gap: theme.spacing[12],
    marginTop: theme.spacing[16],
  },
  emptyHint: { marginTop: theme.spacing[32] },
  addRow: { marginTop: theme.spacing[16] },
  footer: { gap: theme.spacing[8] },
});
