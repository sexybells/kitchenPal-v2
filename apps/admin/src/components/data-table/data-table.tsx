import * as React from "react";
import { Search } from "lucide-react";
import type { PageInfo } from "@kitchenpal/api-contract";
import { ApiClientError } from "@/api/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/cn";

export interface DataTableColumn<TItem> {
  key: string;
  header: string;
  render?: (row: TItem) => React.ReactNode;
  className?: string;
}

export interface DataTableProps<TItem> {
  columns: DataTableColumn<TItem>[];
  data: TItem[];
  getRowId: (row: TItem) => string;
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  onRowClick?: (row: TItem) => void;
  /** Search box wiring; omit to hide the search field. */
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  /** Cursor page info + navigation callbacks. */
  page?: PageInfo;
  onNext?: () => void;
  onPrev?: () => void;
  canPrev?: boolean;
  canNext?: boolean;
  /** Extra toolbar controls (filters, create button). */
  toolbar?: React.ReactNode;
  emptyMessage?: string;
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong while loading data.";
}

/**
 * Reusable admin table: search + cursor pagination + explicit loading, error,
 * and empty states. Rendering is driven by columns; row shape is generic so
 * every management screen reuses this one component.
 */
export function DataTable<TItem>({
  columns,
  data,
  getRowId,
  isLoading,
  isError,
  error,
  onRowClick,
  search,
  onSearchChange,
  searchPlaceholder = "Search…",
  page,
  onNext,
  onPrev,
  canPrev,
  canNext,
  toolbar,
  emptyMessage = "No records found.",
}: DataTableProps<TItem>) {
  const showSearch = onSearchChange !== undefined;

  return (
    <div className="flex flex-col gap-4">
      {(showSearch || toolbar) && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {showSearch && (
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
              <Input
                aria-label="Search"
                value={search ?? ""}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder={searchPlaceholder}
                className="pl-9"
              />
            </div>
          )}
          {toolbar && <div className="flex items-center gap-2">{toolbar}</div>}
        </div>
      )}

      <div className="rounded-lg border border-border bg-surface">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {columns.map((column) => (
                <TableHead key={column.key} className={column.className}>
                  {column.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isError ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={columns.length}
                  className="py-10 text-center text-danger"
                >
                  {errorMessage(error)}
                </TableCell>
              </TableRow>
            ) : isLoading ? (
              Array.from({ length: 5 }).map((_, rowIndex) => (
                <TableRow key={rowIndex} className="hover:bg-transparent">
                  {columns.map((column) => (
                    <TableCell key={column.key}>
                      <Skeleton className="h-4 w-full max-w-[160px]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : data.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={columns.length}
                  className="py-10 text-center text-text-muted"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              data.map((row) => (
                <TableRow
                  key={getRowId(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(onRowClick && "cursor-pointer")}
                >
                  {columns.map((column) => (
                    <TableCell key={column.key} className={column.className}>
                      {column.render
                        ? column.render(row)
                        : String(
                            (row as Record<string, unknown>)[column.key] ?? "—",
                          )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-text-muted">
        <span>
          {page?.total !== undefined
            ? `${page.total} total`
            : `${data.length} shown`}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onPrev}
            disabled={!canPrev}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onNext}
            disabled={!canNext}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
