import type { AdminScanResponse } from "@kitchenpal/api-contract";
import { adminApi } from "@/api/admin";
import { ResourceListPage } from "@/features/shared/resource-list-page";
import type { DataTableColumn } from "@/components/data-table/data-table";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";

const columns: DataTableColumn<AdminScanResponse>[] = [
  { key: "provider", header: "Provider", render: (row) => row.provider },
  {
    key: "status",
    header: "Status",
    render: (row) => (
      <Badge variant={row.status === "completed" ? "success" : "neutral"}>
        {row.status}
      </Badge>
    ),
  },
  {
    key: "degraded",
    header: "Degraded",
    render: (row) =>
      row.degraded ? <Badge variant="warning">degraded</Badge> : "—",
  },
  {
    key: "detectionCount",
    header: "Detections",
    render: (row) => row.detectionCount,
  },
  { key: "householdId", header: "Household", render: (row) => row.householdId ?? "—" },
  {
    key: "createdAt",
    header: "Created",
    render: (row) => formatDateTime(row.createdAt),
  },
];

export function ScansPage() {
  return (
    <ResourceListPage
      title="Pantry scans"
      description="Audit trail of AI pantry scans across all tenants."
      queryKey="scans"
      fetchPage={adminApi.listScans}
      columns={columns}
      getRowId={(row) => row.id}
    />
  );
}
