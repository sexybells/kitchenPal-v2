import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import type {
  ConfirmScanInput,
  ConsumePantryInput,
  CookMealInput,
  CreatePantryItemInput,
  PantryItemQuery,
  PantryItemResponse,
  UpdatePantryItemInput,
} from "@kitchenpal/api-contract";
import { pantryApi, type ScanImageSource } from "../../api/pantry";

/** Pantry query keys — centralised so mutations invalidate consistently. */
export const pantryKeys = {
  all: ["pantry"] as const,
  items: (query?: Partial<PantryItemQuery>) =>
    ["pantry", "items", query ?? {}] as const,
  refill: ["pantry", "refill"] as const,
  scan: (id: string) => ["pantry", "scan", id] as const,
};

/** Invalidate everything derived from pantry items after a write. */
const invalidatePantry = (client: QueryClient) =>
  client.invalidateQueries({ queryKey: pantryKeys.all });

/** List pantry items for the given filter/sort. Defaults to expiry sort. */
export const usePantryItems = (query: Partial<PantryItemQuery> = {}) => {
  const full: PantryItemQuery = {
    sort: query.sort ?? "expiry",
    limit: query.limit ?? 100,
    category: query.category,
    stockState: query.stockState,
    search: query.search,
    expiringInDays: query.expiringInDays,
    cursor: query.cursor,
  };
  return useQuery({
    queryKey: pantryKeys.items(query),
    queryFn: () => pantryApi.list(full),
  });
};

export const useRefillSuggestions = () =>
  useQuery({
    queryKey: pantryKeys.refill,
    queryFn: () => pantryApi.refillSuggestions(),
  });

export const useCreateItem = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePantryItemInput) => pantryApi.create(input),
    onSuccess: () => invalidatePantry(client),
  });
};

export const useUpdateItem = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdatePantryItemInput }) =>
      pantryApi.update(id, input),
    onSuccess: () => invalidatePantry(client),
  });
};

export const useDeleteItem = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => pantryApi.remove(id),
    // Optimistically drop the item from every cached list, restoring on error.
    onMutate: async (id: string) => {
      await client.cancelQueries({ queryKey: pantryKeys.all });
      const snapshot = client.getQueriesData<PantryItemResponse[]>({
        queryKey: ["pantry", "items"],
      });
      for (const [key, items] of snapshot) {
        if (items) {
          client.setQueryData(
            key,
            items.filter((item) => item.id !== id),
          );
        }
      }
      return { snapshot };
    },
    onError: (_error, _id, context) => {
      for (const [key, items] of context?.snapshot ?? []) {
        client.setQueryData(key, items);
      }
    },
    onSettled: () => invalidatePantry(client),
  });
};

/** Upload a photo scan; returns the created (pending) scan for polling. */
export const useCreateScan = () =>
  useMutation({
    mutationFn: (image: ScanImageSource) => pantryApi.createScan(image),
  });

/**
 * Poll a scan until it leaves `pending`. Refetches every 1.5s while pending so
 * the review screen updates as the AI vision job completes.
 */
export const useScan = (id: string | null) =>
  useQuery({
    queryKey: pantryKeys.scan(id ?? "none"),
    queryFn: () => pantryApi.getScan(id as string),
    enabled: id !== null,
    refetchInterval: (query) =>
      query.state.data?.status === "pending" ? 1500 : false,
  });

export const useConfirmScan = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ConfirmScanInput }) =>
      pantryApi.confirmScan(id, input),
    onSuccess: () => invalidatePantry(client),
  });
};

export const useConsume = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: ConsumePantryInput) => pantryApi.consume(input),
    onSuccess: () => invalidatePantry(client),
  });
};

export const useCook = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CookMealInput) => pantryApi.cook(input),
    // Cooking consumes pantry items, so every recipe's "có sẵn / cần mua" split
    // is now stale — invalidate the pantry-match family alongside the pantry.
    onSuccess: () => {
      void invalidatePantry(client);
      void client.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === "recipes" && query.queryKey[1] === "pantry-match",
      });
    },
  });
};
