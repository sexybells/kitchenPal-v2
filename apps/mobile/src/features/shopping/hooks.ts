import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import type {
  AddNeededItemsInput,
  AddShoppingItemInput,
  GenerateShoppingInput,
  ShoppingListResponse,
  UpdateShoppingItemInput,
} from "@kitchenpal/api-contract";
import { shoppingApi } from "../../api/shopping";
import { ApiClientError } from "../../api/errors";

/** Shopping query keys — centralised so mutations invalidate consistently. */
export const shoppingKeys = {
  all: ["shopping"] as const,
  current: ["shopping", "current"] as const,
};

/** Seed the current-list cache from any mutation that returns the fresh list. */
const setCurrentList = (client: QueryClient, list: ShoppingListResponse) =>
  client.setQueryData(shoppingKeys.current, list);

/**
 * The caller's current shopping list. The backend 404s when no list exists yet;
 * that is a normal empty state (not an error), so `useShoppingScreen` treats a
 * 404 as "no list" rather than surfacing it. Not retried — a 404 won't heal.
 */
export const useCurrentShoppingList = () =>
  useQuery({
    queryKey: shoppingKeys.current,
    queryFn: () => shoppingApi.current(),
    retry: (_failureCount, error) =>
      !(error instanceof ApiClientError && error.status === 404),
  });

/** True when the error is the "no current list yet" 404. */
export const isNoListError = (error: unknown): boolean =>
  error instanceof ApiClientError && error.status === 404;

/** Generate (or refresh) the list for a meal plan; seeds the current-list cache. */
export const useGenerateList = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: GenerateShoppingInput) => shoppingApi.generate(input),
    onSuccess: (list) => setCurrentList(client, list),
  });
};

/**
 * Refill / add-missing hand-off to the current list. Retry-safe on the server, so
 * the client just fires and refreshes the list cache on success.
 */
export const useAddNeededItems = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: AddNeededItemsInput) => shoppingApi.addNeededItems(input),
    onSuccess: (list) => setCurrentList(client, list),
  });
};

export const useAddShoppingItem = (listId: string) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: AddShoppingItemInput) => shoppingApi.addItem(listId, input),
    onSuccess: (list) => setCurrentList(client, list),
  });
};

export const useDeleteShoppingItem = (listId: string) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, expectedVersion }: { itemId: string; expectedVersion: number }) =>
      shoppingApi.deleteItem(listId, itemId, expectedVersion),
    onSuccess: (list) => setCurrentList(client, list),
    onError: () => client.invalidateQueries({ queryKey: shoppingKeys.current }),
  });
};

/**
 * Toggle an item's `bought` flag optimistically. The version guard means a stale
 * write is rejected with a 409: on any error we roll back the optimistic flip and
 * refetch the list so the cache reconciles to the server's current version before
 * the shopper tries again.
 */
export const useToggleBought = (listId: string) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      itemId,
      bought,
      expectedVersion,
    }: {
      itemId: string;
      bought: boolean;
      expectedVersion: number;
    }) => {
      const input: UpdateShoppingItemInput = { bought, expectedVersion };
      return shoppingApi.updateItem(listId, itemId, input);
    },
    onMutate: async ({ itemId, bought }) => {
      await client.cancelQueries({ queryKey: shoppingKeys.current });
      const previous = client.getQueryData<ShoppingListResponse>(shoppingKeys.current);
      if (previous) {
        client.setQueryData<ShoppingListResponse>(shoppingKeys.current, {
          ...previous,
          items: previous.items.map((item) =>
            item.id === itemId ? { ...item, bought } : item,
          ),
        });
      }
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) setCurrentList(client, context.previous);
      // Reconcile the stale version (the 409 path) by pulling the fresh list.
      void client.invalidateQueries({ queryKey: shoppingKeys.current });
    },
    onSuccess: (list) => setCurrentList(client, list),
  });
};
