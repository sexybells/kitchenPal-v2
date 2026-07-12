import type { ReactNode } from "react";
import type { Page } from "@/api/client";
import {
  useAdminList,
  type AdminListParams,
} from "@/components/data-table/use-admin-list";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { PageHeader } from "@/components/page-header";

export interface ResourceListPageProps<TItem> {
  title: string;
  description?: string;
  queryKey: string;
  fetchPage: (params: AdminListParams) => Promise<Page<TItem>>;
  columns: DataTableColumn<TItem>[];
  getRowId: (row: TItem) => string;
  searchable?: boolean;
  searchPlaceholder?: string;
  onRowClick?: (row: TItem) => void;
  actions?: ReactNode;
  emptyMessage?: string;
}

/**
 * Read-only list screen: a page header plus a searchable, paginated DataTable
 * wired to `useAdminList`. Used by the log/audit/scan/upload/household screens
 * that need listing but no inline mutation.
 */
export function ResourceListPage<TItem>({
  title,
  description,
  queryKey,
  fetchPage,
  columns,
  getRowId,
  searchable = false,
  searchPlaceholder,
  onRowClick,
  actions,
  emptyMessage,
}: ResourceListPageProps<TItem>) {
  const list = useAdminList<TItem>({ queryKey, fetchPage });

  return (
    <div>
      <PageHeader title={title} description={description} actions={actions} />
      <DataTable
        columns={columns}
        data={list.items}
        getRowId={getRowId}
        isLoading={list.isLoading}
        isError={list.isError}
        error={list.error}
        onRowClick={onRowClick}
        search={searchable ? list.search : undefined}
        onSearchChange={searchable ? list.onSearchChange : undefined}
        searchPlaceholder={searchPlaceholder}
        page={list.page}
        onNext={list.onNext}
        onPrev={list.onPrev}
        canPrev={list.canPrev}
        canNext={list.canNext}
        emptyMessage={emptyMessage}
      />
    </div>
  );
}
