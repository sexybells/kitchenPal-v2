import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  AdminCommunityReportResponse,
  CommunityReportReason,
  CommunityReportStatus,
} from "@kitchenpal/api-contract";
import { adminApi } from "@/api/admin";
import { useAdminList } from "@/components/data-table/use-admin-list";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { formatDateTime } from "@/lib/format";

const REPORTS_QUERY_KEY = "community-reports";

const STATUS_OPTIONS: { value: CommunityReportStatus; label: string }[] = [
  { value: "open", label: "Đang chờ" },
  { value: "reviewed", label: "Đã xử lý" },
  { value: "dismissed", label: "Đã bỏ qua" },
];

const STATUS_LABELS: Record<CommunityReportStatus, string> = {
  open: "Đang chờ",
  reviewed: "Đã xử lý",
  dismissed: "Đã bỏ qua",
};

const REASON_LABELS: Record<CommunityReportReason, string> = {
  spam: "Spam",
  offensive: "Phản cảm",
  harassment: "Quấy rối",
  inappropriate: "Không phù hợp",
  other: "Khác",
};

/**
 * Community moderation: reports queue with a status filter (open by default).
 * An admin can remove the reported content (routing to the post- or
 * comment-remove endpoint by target type) or dismiss the report. Both actions
 * confirm first, then invalidate the list so it reflects fresh server state.
 */
export function CommunityReportsPage() {
  const [status, setStatus] = useState<CommunityReportStatus>("open");

  return (
    <div>
      <PageHeader
        title="Cộng đồng"
        description="Kiểm duyệt báo cáo bài viết và bình luận trong cộng đồng."
      />
      {/* Keyed by status so switching filter resets the cursor pagination. */}
      <ReportsList key={status} status={status} onStatusChange={setStatus} />
    </div>
  );
}

function ReportsList({
  status,
  onStatusChange,
}: {
  status: CommunityReportStatus;
  onStatusChange: (status: CommunityReportStatus) => void;
}) {
  const queryClient = useQueryClient();
  const list = useAdminList<AdminCommunityReportResponse>({
    queryKey: REPORTS_QUERY_KEY,
    fetchPage: adminApi.listCommunityReports,
    extra: { status },
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: [REPORTS_QUERY_KEY] });
  }

  const removeMutation = useMutation({
    mutationFn: (report: AdminCommunityReportResponse) =>
      report.targetType === "post"
        ? adminApi.removeCommunityPost(report.targetId)
        : adminApi.removeCommunityComment(report.targetId),
    onSuccess: invalidate,
  });

  const dismissMutation = useMutation({
    mutationFn: (id: string) => adminApi.dismissCommunityReport(id),
    onSuccess: invalidate,
  });

  const isPending = removeMutation.isPending || dismissMutation.isPending;

  function handleRemove(report: AdminCommunityReportResponse) {
    const what = report.targetType === "post" ? "bài viết" : "bình luận";
    if (window.confirm(`Gỡ ${what} này? Nội dung sẽ bị ẩn khỏi cộng đồng.`)) {
      removeMutation.mutate(report);
    }
  }

  function handleDismiss(report: AdminCommunityReportResponse) {
    if (window.confirm("Bỏ qua báo cáo này?")) {
      dismissMutation.mutate(report.id);
    }
  }

  const columns: DataTableColumn<AdminCommunityReportResponse>[] = [
    {
      key: "targetType",
      header: "Loại",
      render: (row) => (
        <Badge variant="neutral">
          {row.targetType === "post" ? "Bài viết" : "Bình luận"}
        </Badge>
      ),
    },
    {
      key: "reason",
      header: "Lý do",
      render: (row) => REASON_LABELS[row.reason],
    },
    { key: "detail", header: "Chi tiết", render: (row) => row.detail ?? "—" },
    {
      key: "targetPreview",
      header: "Nội dung",
      render: (row) => (
        <span className="line-clamp-2 max-w-xs text-text-muted">
          {row.targetPreview ?? "(đã gỡ)"}
        </span>
      ),
    },
    {
      key: "reporterName",
      header: "Người báo cáo",
      render: (row) => row.reporterName,
    },
    {
      key: "targetAuthorName",
      header: "Tác giả",
      render: (row) => row.targetAuthorName ?? "—",
    },
    {
      key: "status",
      header: "Trạng thái",
      render: (row) => (
        <Badge
          variant={
            row.status === "open"
              ? "warning"
              : row.status === "reviewed"
                ? "success"
                : "neutral"
          }
        >
          {STATUS_LABELS[row.status]}
        </Badge>
      ),
    },
    {
      key: "createdAt",
      header: "Thời gian",
      render: (row) => formatDateTime(row.createdAt),
    },
    {
      key: "actions",
      header: "",
      render: (row) =>
        row.status === "open" ? (
          <div className="flex justify-end gap-2">
            <Button
              variant="danger"
              size="sm"
              disabled={isPending}
              onClick={() => handleRemove(row)}
            >
              Gỡ nội dung
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() => handleDismiss(row)}
            >
              Bỏ qua
            </Button>
          </div>
        ) : (
          <div className="flex justify-end text-text-muted">—</div>
        ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={list.items}
      getRowId={(row) => row.id}
      isLoading={list.isLoading}
      isError={list.isError}
      error={list.error}
      toolbar={
        <Select
          aria-label="Lọc theo trạng thái"
          value={status}
          onChange={(event) =>
            onStatusChange(event.target.value as CommunityReportStatus)
          }
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      }
      page={list.page}
      onNext={list.onNext}
      onPrev={list.onPrev}
      canPrev={list.canPrev}
      canNext={list.canNext}
      emptyMessage="Không có báo cáo nào."
    />
  );
}
