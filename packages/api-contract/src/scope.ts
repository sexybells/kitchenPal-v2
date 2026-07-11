import { z } from "zod";

/**
 * Data-scoping model. Personal mode is first-class: a user can operate fully
 * without a household. `household` scope requires an active household context;
 * `system` is server-owned seed/global data (never client-writable).
 */
export const dataScopeSchema = z.enum(["personal", "household", "system"]);
export type DataScope = z.infer<typeof dataScopeSchema>;
