import { z } from "zod";

/**
 * Canonical response envelope for every KitchenPal API response.
 * Success: `{ data, meta: { requestId } }`.
 * Error:   `{ error: { code, message, details? }, meta: { requestId } }`.
 * `requestId` correlates client logs with server logs.
 */
export const metaSchema = z.object({
  requestId: z.string(),
});
export type Meta = z.infer<typeof metaSchema>;

export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const errorEnvelopeSchema = z.object({
  error: apiErrorSchema,
  meta: metaSchema,
});
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

/** Builds a typed success-envelope schema for a given data schema. */
export const successEnvelope = <T extends z.ZodTypeAny>(data: T) =>
  z.object({ data, meta: metaSchema });

export type SuccessEnvelope<T> = { data: T; meta: Meta };
