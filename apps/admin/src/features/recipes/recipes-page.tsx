import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AdminRecipeResponse } from "@kitchenpal/api-contract";
import { adminApi } from "@/api/admin";
import {
  useAdminList,
} from "@/components/data-table/use-admin-list";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { RecipeCreateDialog } from "./recipe-create-dialog";

/**
 * Recipe management: list + search across all tenants, create a system recipe,
 * publish/unpublish, and soft-delete. Mutations invalidate the list so the
 * table always reflects the latest server state.
 */
export function RecipesPage() {
  const queryClient = useQueryClient();
  const list = useAdminList<AdminRecipeResponse>({
    queryKey: "recipes",
    fetchPage: adminApi.listRecipes,
  });
  const [createOpen, setCreateOpen] = useState(false);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["recipes"] });
  }

  const publishMutation = useMutation({
    mutationFn: ({ id, published }: { id: string; published: boolean }) =>
      adminApi.setRecipePublished(id, published),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteRecipe(id),
    onSuccess: invalidate,
  });

  const columns: DataTableColumn<AdminRecipeResponse>[] = [
    { key: "name", header: "Name", render: (row) => row.name },
    { key: "scope", header: "Scope", render: (row) => row.scope },
    {
      key: "published",
      header: "Status",
      render: (row) =>
        row.published ? (
          <Badge variant="success">published</Badge>
        ) : (
          <Badge variant="neutral">draft</Badge>
        ),
    },
    {
      key: "averageRating",
      header: "Rating",
      render: (row) => `${row.averageRating.toFixed(1)} (${row.reviewCount})`,
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
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              publishMutation.mutate({ id: row.id, published: !row.published })
            }
            disabled={publishMutation.isPending}
          >
            {row.published ? "Unpublish" : "Publish"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (
                window.confirm(`Delete recipe "${row.name}"? This cannot be undone.`)
              ) {
                deleteMutation.mutate(row.id);
              }
            }}
            disabled={deleteMutation.isPending}
          >
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Recipes"
        description="System and tenant recipes across the platform."
        actions={<Button onClick={() => setCreateOpen(true)}>New recipe</Button>}
      />
      <DataTable
        columns={columns}
        data={list.items}
        getRowId={(row) => row.id}
        isLoading={list.isLoading}
        isError={list.isError}
        error={list.error}
        search={list.search}
        onSearchChange={list.onSearchChange}
        searchPlaceholder="Search recipes…"
        page={list.page}
        onNext={list.onNext}
        onPrev={list.onPrev}
        canPrev={list.canPrev}
        canNext={list.canNext}
      />
      <RecipeCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={invalidate}
      />
    </div>
  );
}
