import { SetMetadata } from "@nestjs/common";

/** Metadata key marking a route as callable without authentication. */
export const IS_PUBLIC_KEY = "kitchenpal:public";

/**
 * Marks a route (or controller) as public so the global JWT guard skips it.
 * Everything is authenticated by default; opting out is explicit.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
