/**
 * @kitchenpal/api-contract — shared request/response contracts (zod schemas +
 * inferred TS types). Backend validates against these; clients get typed fetch.
 */
export * from "./envelope.js";
export * from "./pagination.js";
export * from "./scope.js";
export * from "./auth.js";
export * from "./users.js";
export * from "./pantry.js";
export * from "./recipes.js";
export * from "./meal-plan.js";
export * from "./shopping.js";
export * from "./spending.js";
export * from "./household.js";
export * from "./chat.js";
export * from "./community.js";
export * from "./notification.js";
export * from "./subscription.js";
export * from "./admin.js";
