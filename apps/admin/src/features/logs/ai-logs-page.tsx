import type { AdminAiLogResponse } from "@kitchenpal/api-contract";
import { adminApi } from "@/api/admin";
import { ResourceListPage } from "@/features/shared/resource-list-page";
import type { DataTableColumn } from "@/components/data-table/data-table";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, formatUsd } from "@/lib/format";

const columns: DataTableColumn<AdminAiLogResponse>[] = [
  { key: "provider", header: "Provider", render: (row) => row.provider },
  { key: "operation", header: "Operation", render: (row) => row.operation },
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
    key: "costUsd",
    header: "Cost",
    render: (row) => (row.costUsd !== null ? formatUsd(row.costUsd) : "—"),
  },
  {
    key: "createdAt",
    header: "When",
    render: (row) => formatDateTime(row.createdAt),
  },
];

export function AiLogsPage() {
  return (
    <ResourceListPage
      title="AI logs"
      description="Every AI provider call, its result, and token cost."
      queryKey="logs-ai"
      fetchPage={adminApi.listAiLogs}
      columns={columns}
      getRowId={(row) => row.id}
    />
  );
}
