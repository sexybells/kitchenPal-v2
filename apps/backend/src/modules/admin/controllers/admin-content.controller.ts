import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  adminListQuerySchema,
  adminPublishRecipeSchema,
  adminRecipeQuerySchema,
  createRecipeSchema,
  objectIdSchema,
  updateRecipeSchema,
  type AdminHouseholdResponse,
  type AdminListQuery,
  type AdminPublishRecipeInput,
  type AdminRecipeQuery,
  type AdminRecipeResponse,
  type AdminScanResponse,
  type AdminUploadResponse,
  type CreateRecipeInput,
  type UpdateRecipeInput,
} from "@kitchenpal/api-contract";
import type { AuthUser } from "../../../common/scope/auth-user";
import type { PageResult } from "../../../common/http/page-result";
import { CurrentUser } from "../../../common/scope/current-user.decorator";
import { Roles } from "../../../common/scope/roles.decorator";
import { ZodValidationPipe } from "../../../common/validation/zod-validation.pipe";
import { AdminContentService } from "../services/admin-content.service";

/**
 * Admin content management across all tenants: households (read), recipes
 * (CRUD + publish), pantry-scan audit (read), uploads (read). Strictly
 * `admin`-role-gated; every recipe mutation is audit-logged in the service.
 */
@ApiTags("admin")
@ApiBearerAuth()
@Roles("admin")
@Controller("admin")
export class AdminContentController {
  constructor(private readonly content: AdminContentService) {}

  @Get("households")
  @ApiOperation({ summary: "List households across all tenants" })
  listHouseholds(
    @Query(new ZodValidationPipe(adminListQuerySchema)) query: AdminListQuery,
  ): Promise<PageResult<AdminHouseholdResponse>> {
    return this.content.listHouseholds(query);
  }

  @Get("households/:id")
  @ApiOperation({ summary: "Get a household by id" })
  getHousehold(
    @Param("id", new ZodValidationPipe(objectIdSchema)) id: string,
  ): Promise<AdminHouseholdResponse> {
    return this.content.getHousehold(id);
  }

  @Get("recipes")
  @ApiOperation({ summary: "List recipes across all tenants" })
  listRecipes(
    @Query(new ZodValidationPipe(adminRecipeQuerySchema)) query: AdminRecipeQuery,
  ): Promise<PageResult<AdminRecipeResponse>> {
    return this.content.listRecipes(query);
  }

  @Post("recipes")
  @ApiOperation({ summary: "Create a system recipe" })
  createRecipe(
    @CurrentUser() actor: AuthUser,
    @Body(new ZodValidationPipe(createRecipeSchema)) body: CreateRecipeInput,
  ): Promise<AdminRecipeResponse> {
    return this.content.createRecipe(actor.id, body);
  }

  @Get("recipes/:id")
  @ApiOperation({ summary: "Get a recipe by id" })
  getRecipe(
    @Param("id", new ZodValidationPipe(objectIdSchema)) id: string,
  ): Promise<AdminRecipeResponse> {
    return this.content.getRecipe(id);
  }

  @Patch("recipes/:id")
  @ApiOperation({ summary: "Update any recipe" })
  updateRecipe(
    @CurrentUser() actor: AuthUser,
    @Param("id", new ZodValidationPipe(objectIdSchema)) id: string,
    @Body(new ZodValidationPipe(updateRecipeSchema)) body: UpdateRecipeInput,
  ): Promise<AdminRecipeResponse> {
    return this.content.updateRecipe(actor.id, id, body);
  }

  @Patch("recipes/:id/publish")
  @ApiOperation({ summary: "Publish or unpublish any recipe" })
  setPublished(
    @CurrentUser() actor: AuthUser,
    @Param("id", new ZodValidationPipe(objectIdSchema)) id: string,
    @Body(new ZodValidationPipe(adminPublishRecipeSchema))
    body: AdminPublishRecipeInput,
  ): Promise<AdminRecipeResponse> {
    return this.content.setPublished(actor.id, id, body);
  }

  @Delete("recipes/:id")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Soft-delete any recipe" })
  async deleteRecipe(
    @CurrentUser() actor: AuthUser,
    @Param("id", new ZodValidationPipe(objectIdSchema)) id: string,
  ): Promise<{ deleted: boolean }> {
    await this.content.deleteRecipe(actor.id, id);
    return { deleted: true };
  }

  @Get("scans")
  @ApiOperation({ summary: "List pantry scans (audit) across all tenants" })
  listScans(
    @Query(new ZodValidationPipe(adminListQuerySchema)) query: AdminListQuery,
  ): Promise<PageResult<AdminScanResponse>> {
    return this.content.listScans(query);
  }

  @Get("scans/:id")
  @ApiOperation({ summary: "Get a scan with its detections" })
  getScan(
    @Param("id", new ZodValidationPipe(objectIdSchema)) id: string,
  ): Promise<AdminScanResponse> {
    return this.content.getScan(id);
  }

  @Get("uploads")
  @ApiOperation({ summary: "List uploads across all tenants" })
  listUploads(
    @Query(new ZodValidationPipe(adminListQuerySchema)) query: AdminListQuery,
  ): Promise<PageResult<AdminUploadResponse>> {
    return this.content.listUploads(query);
  }
}
