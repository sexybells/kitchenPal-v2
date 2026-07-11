import type { PageInfo } from "@kitchenpal/api-contract";

/**
 * Marker returned by controllers to signal a paginated response. The response
 * interceptor unwraps it into `{ data: items, meta: { requestId, page } }`
 * matching the shared `pageInfoSchema`.
 */
export class PageResult<T> {
  constructor(
    readonly items: T[],
    readonly page: PageInfo,
  ) {}
}

/** Builds a {@link PageResult} with a cursor-based {@link PageInfo} block. */
export function paginate<T>(
  items: T[],
  options: { nextCursor?: string | null; total?: number } = {},
): PageResult<T> {
  const nextCursor = options.nextCursor ?? null;
  return new PageResult(items, {
    nextCursor,
    hasMore: nextCursor !== null,
    total: options.total,
  });
}
