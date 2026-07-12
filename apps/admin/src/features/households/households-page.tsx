import type { AdminHouseholdResponse } from "@kitchenpal/api-contract";
import { adminApi } from "@/api/admin";
import { ResourceListPage } from "@/features/shared/resource-list-page";
import type { DataTableColumn } from "@/components/data-table/data-table";
import { formatDateTime } from "@/lib/format";

const columns: DataTableColumn<AdminHouseholdResponse>[] = [
  { key: "name", header: "Name", render: (row) => row.name },
  {
    key: "membersCount",
    header: "Members",
    render: (row) => row.membersCount,
  },
  { key: "ownerUserId", header: "Owner", render: (row) => row.ownerUserId },
  {
    key: "createdAt",
    header: "Created",
    render: (row) => formatDateTime(row.createdAt),
  },
];

export function HouseholdsPage() {
  return (
    <ResourceListPage
      title="Households"
      description="Every household across all tenants."
      queryKey="households"
      fetchPage={adminApi.listHouseholds}
      columns={columns}
      getRowId={(row) => row.id}
      searchable
      searchPlaceholder="Search households…"
    />
  );
}
