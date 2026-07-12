import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { AuthModule } from "../auth/auth.module";
import { User, UserSchema } from "../auth/schemas/user.schema";
import {
  Household,
  HouseholdSchema,
} from "../household/schemas/household.schema";
import {
  HouseholdMember,
  HouseholdMemberSchema,
} from "../household/schemas/household-member.schema";
import {
  AdminAuditLog,
  AdminAuditLogSchema,
} from "../logs/schemas/admin-audit-log.schema";
import { AiLog, AiLogSchema } from "../logs/schemas/ai-log.schema";
import {
  ExternalSearchLog,
  ExternalSearchLogSchema,
} from "../logs/schemas/external-search-log.schema";
import {
  PantryScan,
  PantryScanSchema,
} from "../pantry/schemas/pantry-scan.schema";
import { Recipe, RecipeSchema } from "../recipes/schemas/recipe.schema";
import { SubscriptionsModule } from "../subscriptions/subscriptions.module";
import {
  UserSubscription,
  UserSubscriptionSchema,
} from "../subscriptions/schemas/user-subscription.schema";
import { Upload, UploadSchema } from "../uploads/schemas/upload.schema";
import { AdminContentController } from "./controllers/admin-content.controller";
import { AdminDevController } from "./controllers/admin-dev.controller";
import { AdminLogsController } from "./controllers/admin-logs.controller";
import { AdminReportsController } from "./controllers/admin-reports.controller";
import { AdminSettingsController } from "./controllers/admin-settings.controller";
import { AdminSubscriptionsController } from "./controllers/admin-subscriptions.controller";
import { AdminUsersController } from "./controllers/admin-users.controller";
import {
  AdminAiLogReadRepository,
  AdminAuditLogReadRepository,
  AdminExternalSearchLogReadRepository,
  AdminHouseholdMemberReadRepository,
  AdminHouseholdReadRepository,
  AdminRecipeRepository,
  AdminScanReadRepository,
  AdminUploadReadRepository,
  AdminUserReadRepository,
} from "./repositories/admin-read.repository";
import { SystemSettingRepository } from "./repositories/system-setting.repository";
import {
  SystemSetting,
  SystemSettingSchema,
} from "./schemas/system-setting.schema";
import { AdminAuditService } from "./services/admin-audit.service";
import { AdminContentService } from "./services/admin-content.service";
import { AdminLogsService } from "./services/admin-logs.service";
import { AdminReportsService } from "./services/admin-reports.service";
import { AdminSettingsService } from "./services/admin-settings.service";
import { AdminSubscriptionsService } from "./services/admin-subscriptions.service";
import { AdminUsersService } from "./services/admin-users.service";
import { DevToolsService } from "./services/dev-tools.service";

/**
 * Admin console backend: cross-tenant management, reporting, integration
 * settings, admin-assigned subscriptions, and guarded dev tools. Every route is
 * `admin`-role-gated (via `@Roles('admin')` + the global roles guard) and every
 * mutation is audit-logged. Registers the collections it reads across tenants;
 * Mongoose reuses any model already compiled by an owning feature module.
 */
@Module({
  imports: [
    AuthModule,
    SubscriptionsModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Household.name, schema: HouseholdSchema },
      { name: HouseholdMember.name, schema: HouseholdMemberSchema },
      { name: Recipe.name, schema: RecipeSchema },
      { name: PantryScan.name, schema: PantryScanSchema },
      { name: Upload.name, schema: UploadSchema },
      { name: AiLog.name, schema: AiLogSchema },
      { name: ExternalSearchLog.name, schema: ExternalSearchLogSchema },
      { name: AdminAuditLog.name, schema: AdminAuditLogSchema },
      { name: SystemSetting.name, schema: SystemSettingSchema },
      { name: UserSubscription.name, schema: UserSubscriptionSchema },
    ]),
  ],
  controllers: [
    AdminUsersController,
    AdminContentController,
    AdminLogsController,
    AdminReportsController,
    AdminSettingsController,
    AdminSubscriptionsController,
    AdminDevController,
  ],
  providers: [
    AdminUserReadRepository,
    AdminHouseholdReadRepository,
    AdminHouseholdMemberReadRepository,
    AdminRecipeRepository,
    AdminScanReadRepository,
    AdminUploadReadRepository,
    AdminAiLogReadRepository,
    AdminExternalSearchLogReadRepository,
    AdminAuditLogReadRepository,
    SystemSettingRepository,
    AdminAuditService,
    AdminUsersService,
    AdminContentService,
    AdminLogsService,
    AdminReportsService,
    AdminSettingsService,
    AdminSubscriptionsService,
    DevToolsService,
  ],
})
export class AdminModule {}
