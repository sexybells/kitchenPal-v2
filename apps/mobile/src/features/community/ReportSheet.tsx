import { useTranslation } from "react-i18next";
import { communityReportReasonSchema, type CommunityReportReason } from "@kitchenpal/api-contract";
import { ActionSheet, type SheetAction } from "./ActionSheet";

export interface ReportSheetProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (reason: CommunityReportReason) => void;
}

const REASONS = communityReportReasonSchema.options;

/** Report bottom-sheet: pick a reason, which fires `onSelect` and closes. */
export function ReportSheet({ visible, onClose, onSelect }: ReportSheetProps) {
  const { t } = useTranslation();
  const actions: SheetAction[] = REASONS.map((reason) => ({
    key: reason,
    label: t(`community.reportReason.${reason}`),
    onPress: () => onSelect(reason),
  }));
  return (
    <ActionSheet
      visible={visible}
      onClose={onClose}
      title={t("community.reportTitle")}
      actions={actions}
      testID="report-sheet"
    />
  );
}
