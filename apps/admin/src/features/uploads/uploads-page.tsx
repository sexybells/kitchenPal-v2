import type { AdminUploadResponse } from "@kitchenpal/api-contract";
import { adminApi } from "@/api/admin";
import { ResourceListPage } from "@/features/shared/resource-list-page";
import type { DataTableColumn } from "@/components/data-table/data-table";
import { formatBytes, formatDateTime } from "@/lib/format";

const columns: DataTableColumn<AdminUploadResponse>[] = [
  { key: "kind", header: "Kind", render: (row) => row.kind },
  {
    key: "key",
    header: "Key",
    render: (row) => <span className="font-mono text-xs">{row.key}</span>,
  },
  { key: "contentType", header: "Type", render: (row) => row.contentType },
  {
    key: "sizeBytes",
    header: "Size",
    render: (row) => formatBytes(row.sizeBytes),
  },
  { key: "ownerUserId", header: "Owner", render: (row) => row.ownerUserId ?? "—" },
  {
    key: "createdAt",
    header: "Uploaded",
    render: (row) => formatDateTime(row.createdAt),
  },
];

export function UploadsPage() {
  return (
    <ResourceListPage
      title="Uploads"
      description="Stored file uploads (avatars and other assets)."
      queryKey="uploads"
      fetchPage={adminApi.listUploads}
      columns={columns}
      getRowId={(row) => row.id}
    />
  );
}
