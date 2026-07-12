import type { AdminExternalSearchLogResponse } from "@kitchenpal/api-contract";
import { adminApi } from "@/api/admin";
import { ResourceListPage } from "@/features/shared/resource-list-page";
import type { DataTableColumn } from "@/components/data-table/data-table";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";

const columns: DataTableColumn<AdminExternalSearchLogResponse>[] = [
  { key: "provider", header: "Provider", render: (row) => row.provider },
  { key: "operation", header: "Operation", render: (row) => row.operation },
  { key: "query", header: "Query", render: (row) => row.query ?? "—" },
  {
    key: "success",
    header: "Result",
    render: (row) =>
      row.success ? (
        <Badge variant="success">ok</Badge>
      ) : (
        <Badge variant="danger">failed</Badge>
      ),
  },
  {
    key: "latencyMs",
    header: "Latency",
    render: (row) => (row.latencyMs !== null ? `${row.latencyMs} ms` : "—"),
  },
  {
    key: "createdAt",
    header: "When",
    render: (row) => formatDateTime(row.createdAt),
  },
];

export function ExternalSearchLogsPage() {
  return (
    <ResourceListPage
      title="External search logs"
      description="Outbound recipe/web search calls to external providers."
      queryKey="logs-external-search"
      fetchPage={adminApi.listExternalSearchLogs}
      columns={columns}
      getRowId={(row) => row.id}
    />
  );
}
