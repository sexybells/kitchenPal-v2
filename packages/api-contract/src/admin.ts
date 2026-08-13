import { z } from "zod";
import { roleSchema, localeSchema } from "./auth.js";
import { dataScopeSchema } from "./scope.js";
import { paginationQuerySchema } from "./pagination.js";
import { objectIdSchema } from "./pantry.js";

/**
 * Admin API contracts. Every route behind these is `admin`-role-gated and reads
 * across all tenants; secrets are NEVER carried by any response here.
 */

/** Shared admin list query: pagination plus an optional free-text search. */
export const adminListQuerySchema = paginationQuerySchema.extend({
  search: z.string().min(1).max(200).optional(),
});
export type AdminListQuery = z.infer<typeof adminListQuerySchema>;

// --- Users --------------------------------------------------------------

/** Cross-tenant user projection for the admin console. */
export const adminUserResponseSchema = z.object({
  id: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  roles: z.array(roleSchema),
  locale: localeSchema,
  emailVerified: z.boolean(),
  phoneVerified: z.boolean(),
  activeHouseholdId: z.string().nullable(),
  suspended: z.boolean(),
  suspendedAt: z.string().nullable(),
  version: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AdminUserResponse = z.infer<typeof adminUserResponseSchema>;

/** Replace a user's role set (admin only). */
export const adminUpdateRolesSchema = z.object({
  roles: z.array(roleSchema).min(1),
});
export type AdminUpdateRolesInput = z.infer<typeof adminUpdateRolesSchema>;

/** Suspend or reinstate a user (admin only). A suspended user cannot log in. */
export const adminSuspendUserSchema = z.object({
  suspended: z.boolean(),
  reason: z.string().max(500).optional(),
});
export type AdminSuspendUserInput = z.infer<typeof adminSuspendUserSchema>;

// --- Households ---------------------------------------------------------

export const adminHouseholdResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  ownerUserId: z.string(),
  membersCount: z.number().int().nonnegative(),
  version: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AdminHouseholdResponse = z.infer<
  typeof adminHouseholdResponseSchema
>;

// --- Recipes ------------------------------------------------------------

export const adminRecipeResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Dish photo, or null when the recipe still falls back to a placeholder. */
  imageUrl: z.string().nullable(),
  scope: dataScopeSchema,
  ownerUserId: z.string().nullable(),
  householdId: z.string().nullable(),
  published: z.boolean(),
  averageRating: z.number(),
  reviewCount: z.number(),
  version: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AdminRecipeResponse = z.infer<typeof adminRecipeResponseSchema>;

export const adminRecipeQuerySchema = adminListQuerySchema.extend({
  published: z.enum(["true", "false"]).optional(),
});
export type AdminRecipeQuery = z.infer<typeof adminRecipeQuerySchema>;

export const adminPublishRecipeSchema = z.object({
  published: z.boolean(),
});
export type AdminPublishRecipeInput = z.infer<typeof adminPublishRecipeSchema>;

// --- Pantry-scan audit --------------------------------------------------

export const adminScanDetectionSchema = z.object({
  name: z.string(),
  stockState: z.string(),
  confidence: z.number(),
  lowConfidence: z.boolean(),
});
export type AdminScanDetection = z.infer<typeof adminScanDetectionSchema>;

export const adminScanResponseSchema = z.object({
  id: z.string(),
  status: z.string(),
  provider: z.string(),
  degraded: z.boolean(),
  scope: dataScopeSchema,
  householdId: z.string().nullable(),
  createdBy: z.string().nullable(),
  detectionCount: z.number().int().nonnegative(),
  detections: z.array(adminScanDetectionSchema),
  createdAt: z.string(),
});
export type AdminScanResponse = z.infer<typeof adminScanResponseSchema>;

// --- Logs ---------------------------------------------------------------

export const adminAiLogResponseSchema = z.object({
  id: z.string(),
  provider: z.string(),
  operation: z.string(),
  success: z.boolean(),
  latencyMs: z.number().nullable(),
  promptTokens: z.number().nullable(),
  completionTokens: z.number().nullable(),
  costUsd: z.number().nullable(),
  userId: z.string().nullable(),
  createdAt: z.string(),
});
export type AdminAiLogResponse = z.infer<typeof adminAiLogResponseSchema>;

export const adminExternalSearchLogResponseSchema = z.object({
  id: z.string(),
  provider: z.string(),
  operation: z.string(),
  query: z.string().nullable(),
  url: z.string().nullable(),
  success: z.boolean(),
  latencyMs: z.number().nullable(),
  userId: z.string().nullable(),
  createdAt: z.string(),
});
export type AdminExternalSearchLogResponse = z.infer<
  typeof adminExternalSearchLogResponseSchema
>;

export const adminAuditLogResponseSchema = z.object({
  id: z.string(),
  actorId: z.string(),
  action: z.string(),
  targetType: z.string().nullable(),
  targetId: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string(),
});
export type AdminAuditLogResponse = z.infer<typeof adminAuditLogResponseSchema>;

// --- Uploads ------------------------------------------------------------

export const adminUploadResponseSchema = z.object({
  id: z.string(),
  key: z.string(),
  url: z.string(),
  kind: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  ownerUserId: z.string().nullable(),
  createdAt: z.string(),
});
export type AdminUploadResponse = z.infer<typeof adminUploadResponseSchema>;

// --- Integration settings ----------------------------------------------

/**
 * A single integration toggle. `config` holds ONLY non-secret values (provider
 * names, model ids, feature flags). Secrets live in environment variables and
 * are never stored here or returned by any settings endpoint.
 */
export const systemSettingResponseSchema = z.object({
  key: z.string(),
  enabled: z.boolean(),
  config: z.record(z.string(), z.unknown()),
  updatedAt: z.string(),
});
export type SystemSettingResponse = z.infer<typeof systemSettingResponseSchema>;

export const systemSettingsResponseSchema = z.object({
  settings: z.array(systemSettingResponseSchema),
});
export type SystemSettingsResponse = z.infer<
  typeof systemSettingsResponseSchema
>;

/** Known integration setting keys the console can toggle. */
export const integrationKeySchema = z.enum([
  "ai",
  "email",
  "sms",
  "push",
  "storage",
  "external_search",
]);
export type IntegrationKey = z.infer<typeof integrationKeySchema>;

/** Update a toggle + its non-secret config. Secret-looking keys are rejected. */
export const updateSettingSchema = z.object({
  enabled: z.boolean(),
  config: z.record(z.string(), z.unknown()).default({}),
});
export type UpdateSettingInput = z.infer<typeof updateSettingSchema>;

// --- Reports ------------------------------------------------------------

/** Time-bucket granularity for growth/trend reports. */
export const reportBucketSchema = z.enum(["day", "week", "month"]);
export type ReportBucket = z.infer<typeof reportBucketSchema>;

/**
 * Bounded time-range query. `from`/`to` are ISO instants; when omitted the
 * service defaults to a recent window. Buckets are UTC-aligned by `bucket`.
 */
export const reportRangeQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  bucket: reportBucketSchema.default("day"),
});
export type ReportRangeQuery = z.infer<typeof reportRangeQuerySchema>;

export const usageReportSchema = z.object({
  users: z.number().int().nonnegative(),
  households: z.number().int().nonnegative(),
  recipes: z.number().int().nonnegative(),
  scans: z.number().int().nonnegative(),
  aiCalls: z.number().int().nonnegative(),
  activeSubscriptions: z.number().int().nonnegative(),
});
export type UsageReport = z.infer<typeof usageReportSchema>;

export const growthBucketSchema = z.object({
  date: z.string(),
  newUsers: z.number().int().nonnegative(),
  newHouseholds: z.number().int().nonnegative(),
});
export type GrowthBucket = z.infer<typeof growthBucketSchema>;

export const growthReportSchema = z.object({
  bucket: reportBucketSchema,
  buckets: z.array(growthBucketSchema),
});
export type GrowthReport = z.infer<typeof growthReportSchema>;

export const aiTrendBucketSchema = z.object({
  date: z.string(),
  calls: z.number().int().nonnegative(),
  failures: z.number().int().nonnegative(),
});
export type AiTrendBucket = z.infer<typeof aiTrendBucketSchema>;

export const aiTrendReportSchema = z.object({
  bucket: reportBucketSchema,
  buckets: z.array(aiTrendBucketSchema),
});
export type AiTrendReport = z.infer<typeof aiTrendReportSchema>;

export const aiCostByProviderSchema = z.object({
  provider: z.string(),
  calls: z.number().int().nonnegative(),
  promptTokens: z.number().nonnegative(),
  completionTokens: z.number().nonnegative(),
  costUsd: z.number().nonnegative(),
});
export type AiCostByProvider = z.infer<typeof aiCostByProviderSchema>;

export const aiCostReportSchema = z.object({
  totalCalls: z.number().int().nonnegative(),
  totalPromptTokens: z.number().nonnegative(),
  totalCompletionTokens: z.number().nonnegative(),
  totalCostUsd: z.number().nonnegative(),
  byProvider: z.array(aiCostByProviderSchema),
});
export type AiCostReport = z.infer<typeof aiCostReportSchema>;

// --- Dev tools ----------------------------------------------------------

/** Result of a guarded dev-tool action (non-production only). */
export const devToolResultSchema = z.object({
  action: z.string(),
  affected: z.number().int().nonnegative(),
});
export type DevToolResult = z.infer<typeof devToolResultSchema>;

/** Admin-facing user id path param. */
export const adminIdParamSchema = z.object({
  id: objectIdSchema,
});
export type AdminIdParam = z.infer<typeof adminIdParamSchema>;
