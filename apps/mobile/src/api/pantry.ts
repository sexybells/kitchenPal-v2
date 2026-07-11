import { z } from "zod";
import {
  confirmScanSchema,
  consumeResultSchema,
  cookResultSchema,
  pantryItemResponseSchema,
  pantryScanResponseSchema,
  refillSuggestionsResponseSchema,
  type ConfirmScanInput,
  type ConsumePantryInput,
  type ConsumeResult,
  type CookMealInput,
  type CookResult,
  type CreatePantryItemInput,
  type PantryItemQuery,
  type PantryItemResponse,
  type PantryScanResponse,
  type RefillSuggestionsResponse,
  type UpdatePantryItemInput,
} from "@kitchenpal/api-contract";
import { api } from "./api";

/** The list endpoint returns `data: PantryItem[]` inside a paginated envelope. */
const pantryItemListSchema = z.array(pantryItemResponseSchema);

/** An image reference for a scan upload (from the camera or photo library). */
export interface ScanImageSource {
  uri: string;
  name: string;
  mimeType: string;
}

/** Serialise a list query into a `?a=b&c=d` string, skipping empty values. */
const toQueryString = (query: PantryItemQuery): string => {
  const params = new URLSearchParams();
  if (query.category) params.set("category", query.category);
  if (query.stockState) params.set("stockState", query.stockState);
  if (query.search) params.set("search", query.search);
  if (query.expiringInDays !== undefined) {
    params.set("expiringInDays", String(query.expiringInDays));
  }
  if (query.sort) params.set("sort", query.sort);
  if (query.limit) params.set("limit", String(query.limit));
  if (query.cursor) params.set("cursor", query.cursor);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
};

/**
 * Pantry endpoint wrappers — each unwraps + validates the response envelope,
 * mirroring `authApi`. All routes are personal-scoped and require the token.
 */
export const pantryApi = {
  list: (query: PantryItemQuery): Promise<PantryItemResponse[]> =>
    api.request(`pantry/items${toQueryString(query)}`, {
      method: "GET",
      auth: true,
      schema: pantryItemListSchema,
    }),

  create: (input: CreatePantryItemInput): Promise<PantryItemResponse> =>
    api.request("pantry/items", {
      body: input,
      auth: true,
      schema: pantryItemResponseSchema,
    }),

  update: (id: string, input: UpdatePantryItemInput): Promise<PantryItemResponse> =>
    api.request(`pantry/items/${id}`, {
      method: "PATCH",
      body: input,
      auth: true,
      schema: pantryItemResponseSchema,
    }),

  remove: (id: string): Promise<void> =>
    api
      .request(`pantry/items/${id}`, { method: "DELETE", auth: true })
      .then(() => undefined),

  refillSuggestions: (): Promise<RefillSuggestionsResponse> =>
    api.request("pantry/refill-suggestions", {
      method: "GET",
      auth: true,
      schema: refillSuggestionsResponseSchema,
    }),

  consume: (input: ConsumePantryInput): Promise<ConsumeResult> =>
    api.request("pantry/consume", {
      body: input,
      auth: true,
      schema: consumeResultSchema,
    }),

  cook: (input: CookMealInput): Promise<CookResult> =>
    api.request("pantry/cook", {
      body: input,
      auth: true,
      schema: cookResultSchema,
    }),

  createScan: (image: ScanImageSource): Promise<PantryScanResponse> => {
    const form = new FormData();
    // React Native FormData accepts a `{ uri, name, type }` file descriptor.
    form.append("image", {
      uri: image.uri,
      name: image.name,
      type: image.mimeType,
    } as unknown as Blob);
    return api.request("pantry/scans", {
      body: form,
      auth: true,
      schema: pantryScanResponseSchema,
    });
  },

  getScan: (id: string): Promise<PantryScanResponse> =>
    api.request(`pantry/scans/${id}`, {
      method: "GET",
      auth: true,
      schema: pantryScanResponseSchema,
    }),

  // The confirm response body is not consumed by the UI — the flow refreshes
  // the pantry list afterwards — so it is intentionally left unvalidated.
  confirmScan: (id: string, input: ConfirmScanInput): Promise<void> =>
    api
      .request(`pantry/scans/${id}/confirm`, { body: input, auth: true })
      .then(() => undefined),
};

export { confirmScanSchema };
