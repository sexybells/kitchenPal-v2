import {
  shoppingListResponseSchema,
  type AddNeededItemsInput,
  type AddShoppingItemInput,
  type GenerateShoppingInput,
  type ShoppingListResponse,
  type UpdateShoppingItemInput,
} from "@kitchenpal/api-contract";
import { api } from "./api";

/**
 * Shopping-list endpoint wrappers — each unwraps + validates the response
 * envelope, mirroring `pantryApi`. Every item mutation returns the full updated
 * list (with its bumped `version`) so the cache always holds the fresh version
 * the next versioned write must send. All routes are personal-scoped.
 */
export const shoppingApi = {
  current: (): Promise<ShoppingListResponse> =>
    api.request("shopping/current", {
      method: "GET",
      auth: true,
      schema: shoppingListResponseSchema,
    }),

  getById: (id: string): Promise<ShoppingListResponse> =>
    api.request(`shopping/${id}`, {
      method: "GET",
      auth: true,
      schema: shoppingListResponseSchema,
    }),

  generate: (input: GenerateShoppingInput): Promise<ShoppingListResponse> =>
    api.request("shopping/generate", {
      body: input,
      auth: true,
      schema: shoppingListResponseSchema,
    }),

  /** Refill / add-missing hand-off. Retry-safe: server merges by name + unit. */
  addNeededItems: (input: AddNeededItemsInput): Promise<ShoppingListResponse> =>
    api.request("shopping/needed-items", {
      body: input,
      auth: true,
      schema: shoppingListResponseSchema,
    }),

  addItem: (
    id: string,
    input: AddShoppingItemInput,
  ): Promise<ShoppingListResponse> =>
    api.request(`shopping/${id}/items`, {
      body: input,
      auth: true,
      schema: shoppingListResponseSchema,
    }),

  updateItem: (
    id: string,
    itemId: string,
    input: UpdateShoppingItemInput,
  ): Promise<ShoppingListResponse> =>
    api.request(`shopping/${id}/items/${itemId}`, {
      method: "PATCH",
      body: input,
      auth: true,
      schema: shoppingListResponseSchema,
    }),

  deleteItem: (
    id: string,
    itemId: string,
    expectedVersion: number,
  ): Promise<ShoppingListResponse> =>
    api.request(
      `shopping/${id}/items/${itemId}?expectedVersion=${expectedVersion}`,
      { method: "DELETE", auth: true, schema: shoppingListResponseSchema },
    ),
};
