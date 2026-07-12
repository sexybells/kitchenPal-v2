import { Injectable, NotFoundException } from "@nestjs/common";
import type {
  AdminHouseholdResponse,
  AdminListQuery,
  AdminPublishRecipeInput,
  AdminRecipeQuery,
  AdminRecipeResponse,
  AdminScanResponse,
  AdminUploadResponse,
  CreateRecipeInput,
  UpdateRecipeInput,
} from "@kitchenpal/api-contract";
import type { FilterQuery, HydratedDocument } from "mongoose";
import { ErrorCode } from "../../../common/http/error-codes";
import { PageResult } from "../../../common/http/page-result";
import type { BaseDocumentFields } from "../../../common/database/base.schema";
import type { Household } from "../../household/schemas/household.schema";
import type { PantryScan } from "../../pantry/schemas/pantry-scan.schema";
import type { Recipe } from "../../recipes/schemas/recipe.schema";
import type { Upload } from "../../uploads/schemas/upload.schema";
import {
  AdminHouseholdReadRepository,
  AdminRecipeRepository,
  AdminScanReadRepository,
  AdminUploadReadRepository,
} from "../repositories/admin-read.repository";
import { AdminAuditService, buildPage } from "./admin-audit.service";
import { decodeCursor, escapeRegExp } from "./admin-pagination";

type HouseholdEntity = Household & BaseDocumentFields;
type RecipeEntity = Recipe & BaseDocumentFields;
type ScanEntity = PantryScan & BaseDocumentFields;
type UploadEntity = Upload & BaseDocumentFields;
type RecipeDoc = HydratedDocument<RecipeEntity>;

/**
 * Admin management of shared content across tenants: households (read-only),
 * recipe moderation (CRUD + publish/unpublish on server-owned content), the
 * pantry-scan audit trail, and the uploads audit. All reads are cross-tenant
 * and paginated; every recipe mutation is audit-logged.
 */
@Injectable()
export class AdminContentService {
  constructor(
    private readonly households: AdminHouseholdReadRepository,
    private readonly recipes: AdminRecipeRepository,
    private readonly scans: AdminScanReadRepository,
    private readonly uploads: AdminUploadReadRepository,
    private readonly audit: AdminAuditService,
  ) {}

  // --- Households -------------------------------------------------------

  async listHouseholds(
    query: AdminListQuery,
  ): Promise<PageResult<AdminHouseholdResponse>> {
    const skip = decodeCursor(query.cursor);
    const filter: FilterQuery<HouseholdEntity> = {};
    if (query.search) {
      filter.name = { $regex: escapeRegExp(query.search), $options: "i" };
    }
    const { items, total } = await this.households.paginate(
      filter,
      { createdAt: -1 },
      skip,
      query.limit,
    );
    return buildPage(items.map(toHouseholdResponse), skip, total);
  }

  async getHousehold(id: string): Promise<AdminHouseholdResponse> {
    const doc = await this.households.findById(id);
    if (!doc) {
      throw this.notFound("Household", id);
    }
    return toHouseholdResponse(doc);
  }

  // --- Recipes ----------------------------------------------------------

  async listRecipes(
    query: AdminRecipeQuery,
  ): Promise<PageResult<AdminRecipeResponse>> {
    const skip = decodeCursor(query.cursor);
    const filter: FilterQuery<RecipeEntity> = {};
    if (query.search) {
      filter.name = { $regex: escapeRegExp(query.search), $options: "i" };
    }
    if (query.published) {
      filter.published = query.published === "true";
    }
    const { items, total } = await this.recipes.paginate(
      filter,
      { createdAt: -1 },
      skip,
      query.limit,
    );
    return buildPage(items.map(toRecipeResponse), skip, total);
  }

  async getRecipe(id: string): Promise<AdminRecipeResponse> {
    return toRecipeResponse(await this.requireRecipe(id));
  }

  /** Admin-authored recipes are server-owned (`system`) seed content. */
  async createRecipe(
    actorId: string,
    input: CreateRecipeInput,
  ): Promise<AdminRecipeResponse> {
    const created = await this.recipes.create(
      {
        name: input.name,
        normalizedName: input.name.trim().toLowerCase(),
        mealType: input.mealType,
        tags: input.tags,
        cookTimeMinutes: input.cookTimeMinutes ?? null,
        servings: input.servings ?? null,
        ingredients: input.ingredients,
        steps: input.steps,
        imageUrl: input.imageUrl ?? null,
        sourceType: "system",
        scope: "system",
        published: false,
      } as unknown as Partial<RecipeEntity>,
      actorId,
    );
    await this.audit.record(actorId, {
      action: "recipe.create",
      targetType: "recipe",
      targetId: created.id,
      after: { name: created.name, scope: "system" },
    });
    return toRecipeResponse(created);
  }

  async updateRecipe(
    actorId: string,
    id: string,
    input: UpdateRecipeInput,
  ): Promise<AdminRecipeResponse> {
    const recipe = await this.requireRecipe(id);
    const update: Record<string, unknown> = { ...input };
    if (input.name !== undefined) {
      update.normalizedName = input.name.trim().toLowerCase();
    }
    const updated = await this.recipes.updateWithVersion(
      recipe.id,
      recipe.version,
      update,
      actorId,
    );
    await this.audit.record(actorId, {
      action: "recipe.update",
      targetType: "recipe",
      targetId: id,
      after: { fields: Object.keys(input) },
    });
    return toRecipeResponse(updated);
  }

  async setPublished(
    actorId: string,
    id: string,
    input: AdminPublishRecipeInput,
  ): Promise<AdminRecipeResponse> {
    const recipe = await this.requireRecipe(id);
    const updated = await this.recipes.updateWithVersion(
      recipe.id,
      recipe.version,
      { published: input.published },
      actorId,
    );
    await this.audit.record(actorId, {
      action: input.published ? "recipe.publish" : "recipe.unpublish",
      targetType: "recipe",
      targetId: id,
    });
    return toRecipeResponse(updated);
  }

  async deleteRecipe(actorId: string, id: string): Promise<void> {
    const recipe = await this.requireRecipe(id);
    await this.recipes.softDelete(recipe.id, actorId);
    await this.audit.record(actorId, {
      action: "recipe.delete",
      targetType: "recipe",
      targetId: id,
    });
  }

  // --- Pantry-scan audit ------------------------------------------------

  async listScans(
    query: AdminListQuery,
  ): Promise<PageResult<AdminScanResponse>> {
    const skip = decodeCursor(query.cursor);
    const { items, total } = await this.scans.paginate(
      {},
      { createdAt: -1 },
      skip,
      query.limit,
    );
    return buildPage(items.map(toScanResponse), skip, total);
  }

  async getScan(id: string): Promise<AdminScanResponse> {
    const doc = await this.scans.findById(id);
    if (!doc) {
      throw this.notFound("Scan", id);
    }
    return toScanResponse(doc);
  }

  // --- Uploads ----------------------------------------------------------

  async listUploads(
    query: AdminListQuery,
  ): Promise<PageResult<AdminUploadResponse>> {
    const skip = decodeCursor(query.cursor);
    const filter: FilterQuery<UploadEntity> = {};
    if (query.search) {
      filter.key = { $regex: escapeRegExp(query.search), $options: "i" };
    }
    const { items, total } = await this.uploads.paginate(
      filter,
      { createdAt: -1 },
      skip,
      query.limit,
    );
    return buildPage(items.map(toUploadResponse), skip, total);
  }

  private async requireRecipe(id: string): Promise<RecipeDoc> {
    const recipe = await this.recipes.findById(id);
    if (!recipe) {
      throw this.notFound("Recipe", id);
    }
    return recipe;
  }

  private notFound(what: string, id: string): NotFoundException {
    return new NotFoundException({
      code: ErrorCode.NOT_FOUND,
      message: `${what} not found`,
      details: { id },
    });
  }
}

function toHouseholdResponse(
  doc: HydratedDocument<HouseholdEntity>,
): AdminHouseholdResponse {
  return {
    id: doc.id,
    name: doc.name,
    ownerUserId: doc.ownerUserId.toString(),
    membersCount: doc.membersCount,
    version: doc.version,
    createdAt: (doc.createdAt ?? new Date()).toISOString(),
    updatedAt: (doc.updatedAt ?? new Date()).toISOString(),
  };
}

function toRecipeResponse(doc: RecipeDoc): AdminRecipeResponse {
  const scoped = doc as RecipeDoc & {
    scope: AdminRecipeResponse["scope"];
    householdId?: { toString(): string } | null;
    published: boolean;
    averageRating: number;
    reviewCount: number;
  };
  return {
    id: doc.id,
    name: doc.name,
    scope: scoped.scope,
    ownerUserId: doc.createdBy ? doc.createdBy.toString() : null,
    householdId: scoped.householdId ? scoped.householdId.toString() : null,
    published: scoped.published,
    averageRating: scoped.averageRating,
    reviewCount: scoped.reviewCount,
    version: doc.version,
    createdAt: (doc.createdAt ?? new Date()).toISOString(),
    updatedAt: (doc.updatedAt ?? new Date()).toISOString(),
  };
}

function toScanResponse(
  doc: HydratedDocument<ScanEntity>,
): AdminScanResponse {
  const scoped = doc as HydratedDocument<ScanEntity> & {
    scope: AdminScanResponse["scope"];
    householdId?: { toString(): string } | null;
  };
  return {
    id: doc.id,
    status: doc.status,
    provider: doc.provider,
    degraded: doc.degraded,
    scope: scoped.scope,
    householdId: scoped.householdId ? scoped.householdId.toString() : null,
    createdBy: doc.createdBy ? doc.createdBy.toString() : null,
    detectionCount: doc.detections.length,
    detections: doc.detections.map((d) => ({
      name: d.name,
      stockState: d.stockState,
      confidence: d.confidence,
      lowConfidence: d.lowConfidence,
    })),
    createdAt: (doc.createdAt ?? new Date()).toISOString(),
  };
}

function toUploadResponse(
  doc: HydratedDocument<UploadEntity>,
): AdminUploadResponse {
  return {
    id: doc.id,
    key: doc.key,
    url: doc.url,
    kind: doc.kind,
    contentType: doc.contentType,
    sizeBytes: doc.sizeBytes,
    ownerUserId: doc.ownerUserId ? doc.ownerUserId.toString() : null,
    createdAt: (doc.createdAt ?? new Date()).toISOString(),
  };
}
