import { z } from "zod";
import {
  adminAiLogResponseSchema,
  adminAuditLogResponseSchema,
  adminCommunityReportResponseSchema,
  adminExternalSearchLogResponseSchema,
  adminHouseholdResponseSchema,
  adminRecipeResponseSchema,
  adminScanResponseSchema,
  adminUploadResponseSchema,
  adminUserResponseSchema,
  aiCostReportSchema,
  aiTrendReportSchema,
  devToolResultSchema,
  growthReportSchema,
  subscriptionPlanResponseSchema,
  systemSettingResponseSchema,
  systemSettingsResponseSchema,
  usageReportSchema,
  userSubscriptionResponseSchema,
  type AdminCommunityReportResponse,
  type AdminHouseholdResponse,
  type AdminRecipeResponse,
  type AdminUserResponse,
  type AssignSubscriptionInput,
  type CreatePlanInput,
  type CreateRecipeInput,
  type ReportRangeQuery,
  type UpdateRecipeInput,
  type SubscriptionPlanResponse,
  type SystemSettingResponse,
  type UpdatePlanInput,
  type UpdateSettingInput,
  type Role,
} from "@kitchenpal/api-contract";
import { api } from "./api";
import type { Page } from "./client";
import type { AdminListParams } from "@/components/data-table/use-admin-list";

/** Build the shared list query object the admin list endpoints expect. */
function listQuery(params: AdminListParams): Record<string, string | number> {
  const query: Record<string, string | number> = { limit: params.limit };
  if (params.cursor) query.cursor = params.cursor;
  if (params.search) query.search = params.search;
  for (const [key, value] of Object.entries(params.extra ?? {})) {
    if (value !== undefined) query[key] = value;
  }
  return query;
}

const plansEnvelopeSchema = z.object({
  plans: z.array(subscriptionPlanResponseSchema),
});

/** All typed admin API calls, grouped by resource. */
export const adminApi = {
  // --- Users ------------------------------------------------------------
  listUsers: (params: AdminListParams): Promise<Page<AdminUserResponse>> =>
    api.requestPage("admin/users", adminUserResponseSchema, {
      query: listQuery(params),
    }),
  getUser: (id: string) =>
    api.request(`admin/users/${id}`, { schema: adminUserResponseSchema }),
  updateUserRoles: (id: string, roles: Role[]) =>
    api.request(`admin/users/${id}/roles`, {
      method: "PATCH",
      body: { roles },
      schema: adminUserResponseSchema,
    }),
  suspendUser: (id: string, suspended: boolean, reason?: string) =>
    api.request(`admin/users/${id}/suspend`, {
      method: "PATCH",
      body: { suspended, reason },
      schema: adminUserResponseSchema,
    }),

  // --- Households -------------------------------------------------------
  listHouseholds: (
    params: AdminListParams,
  ): Promise<Page<AdminHouseholdResponse>> =>
    api.requestPage("admin/households", adminHouseholdResponseSchema, {
      query: listQuery(params),
    }),

  // --- Recipes ----------------------------------------------------------
  listRecipes: (params: AdminListParams): Promise<Page<AdminRecipeResponse>> =>
    api.requestPage("admin/recipes", adminRecipeResponseSchema, {
      query: listQuery(params),
    }),
  getRecipe: (id: string) =>
    api.request(`admin/recipes/${id}`, { schema: adminRecipeResponseSchema }),
  createRecipe: (body: CreateRecipeInput) =>
    api.request("admin/recipes", {
      method: "POST",
      body,
      schema: adminRecipeResponseSchema,
    }),
  updateRecipe: (id: string, body: UpdateRecipeInput) =>
    api.request(`admin/recipes/${id}`, {
      method: "PATCH",
      body,
      schema: adminRecipeResponseSchema,
    }),
  /** Uploads a dish photo and returns its public URL (then PATCH the recipe). */
  uploadRecipeImage: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.request("uploads/recipe-image", {
      method: "POST",
      body: form,
      schema: z.object({ url: z.string() }),
    });
  },
  setRecipePublished: (id: string, published: boolean) =>
    api.request(`admin/recipes/${id}/publish`, {
      method: "PATCH",
      body: { published },
      schema: adminRecipeResponseSchema,
    }),
  deleteRecipe: (id: string): Promise<unknown> =>
    api.request(`admin/recipes/${id}`, { method: "DELETE" }),

  // --- Community moderation ---------------------------------------------
  listCommunityReports: (
    params: AdminListParams,
  ): Promise<Page<AdminCommunityReportResponse>> =>
    api.requestPage(
      "admin/community/reports",
      adminCommunityReportResponseSchema,
      { query: listQuery(params) },
    ),
  removeCommunityPost: (id: string): Promise<unknown> =>
    api.request(`admin/community/posts/${id}/remove`, { method: "POST" }),
  removeCommunityComment: (id: string): Promise<unknown> =>
    api.request(`admin/community/comments/${id}/remove`, { method: "POST" }),
  dismissCommunityReport: (id: string): Promise<unknown> =>
    api.request(`admin/community/reports/${id}/dismiss`, { method: "POST" }),

  // --- Pantry-scan audit -----------------------------------------------
  listScans: (params: AdminListParams) =>
    api.requestPage("admin/scans", adminScanResponseSchema, {
      query: listQuery(params),
    }),

  // --- Uploads ----------------------------------------------------------
  listUploads: (params: AdminListParams) =>
    api.requestPage("admin/uploads", adminUploadResponseSchema, {
      query: listQuery(params),
    }),

  // --- Logs -------------------------------------------------------------
  listAiLogs: (params: AdminListParams) =>
    api.requestPage("admin/logs/ai", adminAiLogResponseSchema, {
      query: listQuery(params),
    }),
  listExternalSearchLogs: (params: AdminListParams) =>
    api.requestPage(
      "admin/logs/external-search",
      adminExternalSearchLogResponseSchema,
      { query: listQuery(params) },
    ),
  listAuditLogs: (params: AdminListParams) =>
    api.requestPage("admin/logs/audit", adminAuditLogResponseSchema, {
      query: listQuery(params),
    }),

  // --- Reports ----------------------------------------------------------
  getUsage: () => api.request("admin/reports/usage", { schema: usageReportSchema }),
  getGrowth: (range: ReportRangeQuery) =>
    api.request("admin/reports/growth", {
      schema: growthReportSchema,
      query: { ...range },
    }),
  getAiTrend: (range: ReportRangeQuery) =>
    api.request("admin/reports/ai-trend", {
      schema: aiTrendReportSchema,
      query: { ...range },
    }),
  getAiCosts: (range: ReportRangeQuery) =>
    api.request("admin/reports/ai-costs", {
      schema: aiCostReportSchema,
      query: { ...range },
    }),

  // --- Settings ---------------------------------------------------------
  getIntegrations: () =>
    api.request("admin/settings/integrations", {
      schema: systemSettingsResponseSchema,
    }),
  updateIntegration: (
    key: string,
    body: UpdateSettingInput,
  ): Promise<SystemSettingResponse> =>
    api.request(`admin/settings/integrations/${key}`, {
      method: "PUT",
      body,
      schema: systemSettingResponseSchema,
    }),

  // --- Subscriptions ----------------------------------------------------
  listPlans: (): Promise<SubscriptionPlanResponse[]> =>
    api
      .request("admin/subscriptions/plans", { schema: plansEnvelopeSchema })
      .then((result) => result.plans),
  createPlan: (body: CreatePlanInput) =>
    api.request("admin/subscriptions/plans", {
      method: "POST",
      body,
      schema: subscriptionPlanResponseSchema,
    }),
  updatePlan: (id: string, body: UpdatePlanInput) =>
    api.request(`admin/subscriptions/plans/${id}`, {
      method: "PATCH",
      body,
      schema: subscriptionPlanResponseSchema,
    }),
  assignSubscription: (body: AssignSubscriptionInput) =>
    api.request("admin/subscriptions/assign", {
      method: "POST",
      body,
      schema: userSubscriptionResponseSchema,
    }),
  cancelSubscription: (userId: string): Promise<unknown> =>
    api.request(`admin/subscriptions/users/${userId}/cancel`, {
      method: "POST",
    }),

  // --- Dev tools --------------------------------------------------------
  seedPlans: () =>
    api.request("admin/dev/seed-plans", {
      method: "POST",
      schema: devToolResultSchema,
    }),
  seedRecipes: () =>
    api.request("admin/dev/seed-recipes", {
      method: "POST",
      schema: devToolResultSchema,
    }),
  resetDevData: () =>
    api.request("admin/dev/reset", {
      method: "POST",
      schema: devToolResultSchema,
    }),
};
