import { z } from "zod";
import { metaSchema } from "./envelope.js";

/** Cursor-friendly page query. `cursor` omitted = first page. */
export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const pageInfoSchema = z.object({
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
  total: z.number().int().nonnegative().optional(),
});
export type PageInfo = z.infer<typeof pageInfoSchema>;

/** Builds a paginated success-envelope schema for a given item schema. */
export const paginatedEnvelope = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    data: z.array(item),
    meta: metaSchema.extend({ page: pageInfoSchema }),
  });
