import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { AdminUserResponse } from "@kitchenpal/api-contract";
import { adminApi } from "@/api/admin";
import { useAdminList } from "@/components/data-table/use-admin-list";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { UserManageDialog } from "./user-manage-dialog";

/**
 * User management: list + search across all tenants. Selecting a user opens a
 * management dialog for role changes, suspension, and subscription assignment.
 */
export function UsersPage() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<AdminUserResponse | null>(null);
  const list = useAdminList<AdminUserResponse>({
    queryKey: "users",
    fetchPage: adminApi.listUsers,
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["users"] });
  }

  const columns: DataTableColumn<AdminUserResponse>[] = [
    { key: "displayName", header: "Name", render: (row) => row.displayName },
    { key: "email", header: "Email", render: (row) => row.email ?? "—" },
    {
      key: "roles",
      header: "Roles",
      render: (row) => (
        <div className="flex gap-1">
          {row.roles.map((role) => (
            <Badge key={role} variant={role === "admin" ? "primary" : "neutral"}>
              {role}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      key: "suspended",
      header: "Status",
      render: (row) =>
        row.suspended ? (
          <Badge variant="danger">suspended</Badge>
        ) : (
          <Badge variant="success">active</Badge>
        ),
    },
    {
      key: "createdAt",
      header: "Joined",
      render: (row) => formatDateTime(row.createdAt),
    },
    {
      key: "actions",
      header: "",
      render: (row) => (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => setSelected(row)}>
            Manage
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Users" description="All accounts across every tenant." />
      <DataTable
        columns={columns}
        data={list.items}
        getRowId={(row) => row.id}
        isLoading={list.isLoading}
        isError={list.isError}
        error={list.error}
        search={list.search}
        onSearchChange={list.onSearchChange}
        searchPlaceholder="Search by name or email…"
        page={list.page}
        onNext={list.onNext}
        onPrev={list.onPrev}
        canPrev={list.canPrev}
        canNext={list.canNext}
      />
      <UserManageDialog
        user={selected}
        onClose={() => setSelected(null)}
        onChanged={invalidate}
      />
    </div>
  );
}
