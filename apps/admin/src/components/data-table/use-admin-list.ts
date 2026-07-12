import { useCallback, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { PageInfo } from "@kitchenpal/api-contract";
import type { Page } from "@/api/client";

export interface AdminListParams {
  limit: number;
  cursor?: string;
  search?: string;
  /** Extra resource-specific filters (e.g. recipe `published`). */
  extra?: Record<string, string | undefined>;
}

export interface UseAdminListOptions<TItem> {
  queryKey: string;
  fetchPage: (params: AdminListParams) => Promise<Page<TItem>>;
  limit?: number;
  /** Extra filters merged into every request and the query key. */
  extra?: Record<string, string | undefined>;
}

export interface AdminListController<TItem> {
  items: TItem[];
  page: PageInfo | undefined;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: unknown;
  search: string;
  onSearchChange: (value: string) => void;
  onNext: () => void;
  onPrev: () => void;
  canPrev: boolean;
  canNext: boolean;
  refetch: () => void;
}

/**
 * Drives a searchable, cursor-paginated admin list. Owns the search term and a
 * cursor stack (so Prev is possible over cursor pagination); changing the search
 * resets to the first page. Fetches through the injected `fetchPage`, which the
 * caller binds to the typed API client for a resource.
 */
export function useAdminList<TItem>({
  queryKey,
  fetchPage,
  limit = 20,
  extra,
}: UseAdminListOptions<TItem>): AdminListController<TItem> {
  const [search, setSearch] = useState("");
  // Stack of cursors visited; `undefined` is the first page.
  const [cursorStack, setCursorStack] = useState<(string | undefined)[]>([
    undefined,
  ]);
  const cursor = cursorStack[cursorStack.length - 1];

  const query = useQuery({
    queryKey: [queryKey, { search, cursor, limit, extra }],
    queryFn: () =>
      fetchPage({ limit, cursor, search: search || undefined, extra }),
    placeholderData: keepPreviousData,
  });

  const onSearchChange = useCallback((value: string) => {
    setSearch(value);
    setCursorStack([undefined]);
  }, []);

  const onNext = useCallback(() => {
    const next = query.data?.page.nextCursor;
    if (next) setCursorStack((stack) => [...stack, next]);
  }, [query.data?.page.nextCursor]);

  const onPrev = useCallback(() => {
    setCursorStack((stack) => (stack.length > 1 ? stack.slice(0, -1) : stack));
  }, []);

  return {
    items: query.data?.items ?? [],
    page: query.data?.page,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    search,
    onSearchChange,
    onNext,
    onPrev,
    canPrev: cursorStack.length > 1,
    canNext: Boolean(query.data?.page.hasMore),
    refetch: () => void query.refetch(),
  };
}
