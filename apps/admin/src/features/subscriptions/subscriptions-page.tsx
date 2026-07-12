import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import type { SubscriptionPlanResponse } from "@kitchenpal/api-contract";
import { adminApi } from "@/api/admin";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateTime, formatVnd } from "@/lib/format";
import { PlanFormDialog } from "./plan-form-dialog";

/**
 * Subscription plan management. Plan CRUD lives here; assigning a plan to a user
 * happens from the Users screen (source=admin). Monetization is admin-only in
 * v1 — there is no self-serve purchase.
 */
export function SubscriptionsPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<SubscriptionPlanResponse | null>(null);

  const plans = useQuery({
    queryKey: ["subscription-plans"],
    queryFn: adminApi.listPlans,
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["subscription-plans"] });
  }

  const columns: DataTableColumn<SubscriptionPlanResponse>[] = [
    { key: "name", header: "Name", render: (row) => row.name },
    {
      key: "tier",
      header: "Tier",
      render: (row) => (
        <Badge variant={row.tier === "pro" ? "primary" : "neutral"}>
          {row.tier}
        </Badge>
      ),
    },
    { key: "priceVnd", header: "Price", render: (row) => formatVnd(row.priceVnd) },
    {
      key: "active",
      header: "Status",
      render: (row) =>
        row.active ? (
          <Badge variant="success">active</Badge>
        ) : (
          <Badge variant="neutral">inactive</Badge>
        ),
    },
    {
      key: "updatedAt",
      header: "Updated",
      render: (row) => formatDateTime(row.updatedAt),
    },
    {
      key: "actions",
      header: "",
      render: (row) => (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => setEditing(row)}>
            Edit
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Subscriptions"
        description="Manage subscription plans. Assign plans to users from the Users screen."
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            New plan
          </Button>
        }
      />

      <Card className="mb-6 border-accent">
        <CardContent className="p-4 text-sm text-text-muted">
          Monetization is admin-only in v1: administrators assign Pro
          subscriptions (source=admin). There is no self-serve purchase flow.
        </CardContent>
      </Card>

      <DataTable
        columns={columns}
        data={plans.data ?? []}
        getRowId={(row) => row.id}
        isLoading={plans.isLoading}
        isError={plans.isError}
        error={plans.error}
        emptyMessage="No plans yet. Create one to get started."
      />

      <PlanFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={invalidate}
      />
      {editing && (
        <PlanFormDialog
          key={editing.id}
          open
          onOpenChange={(open) => !open && setEditing(null)}
          plan={editing}
          onSaved={invalidate}
        />
      )}
    </div>
  );
}
