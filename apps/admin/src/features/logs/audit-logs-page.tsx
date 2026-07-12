import type { AdminAuditLogResponse } from "@kitchenpal/api-contract";
import { adminApi } from "@/api/admin";
import { ResourceListPage } from "@/features/shared/resource-list-page";
import type { DataTableColumn } from "@/components/data-table/data-table";
import { formatDateTime } from "@/lib/format";

const columns: DataTableColumn<AdminAuditLogResponse>[] = [
  { key: "action", header: "Action", render: (row) => row.action },
  { key: "actorId", header: "Actor", render: (row) => row.actorId },
  {
    key: "targetType",
    header: "Target",
    render: (row) =>
      row.targetType ? `${row.targetType}:${row.targetId ?? "?"}` : "—",
  },
  {
    key: "createdAt",
    header: "When",
    render: (row) => formatDateTime(row.createdAt),
  },
];

export function AuditLogsPage() {
  return (
    <ResourceListPage
      title="Audit logs"
      description="Immutable record of every admin mutation."
      queryKey="logs-audit"
      fetchPage={adminApi.listAuditLogs}
      columns={columns}
      getRowId={(row) => row.id}
    />
  );
}
