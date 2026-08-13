import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { DevToolResult } from "@kitchenpal/api-contract";
import { Model } from "mongoose";
import { ErrorCode } from "../../../common/http/error-codes";
import { APP_CONFIG, type AppConfig } from "../../../config/env.schema";
import {
  SubscriptionPlanEntity,
  SubscriptionPlanRepository,
} from "../../subscriptions/repositories/subscription-plan.repository";
import { UserSubscription } from "../../subscriptions/schemas/user-subscription.schema";
import { Recipe } from "../../recipes/schemas/recipe.schema";
import { SystemRecipeSeederService } from "../../recipes/services/system-recipe-seeder.service";
import { SystemSetting } from "../schemas/system-setting.schema";
import { AdminAuditService } from "./admin-audit.service";

/** A plan the seeder guarantees exists in a dev environment. */
const SEED_PLANS: Pick<
  SubscriptionPlanEntity,
  "name" | "tier" | "priceVnd" | "features" | "active"
>[] = [
  { name: "Free", tier: "free", priceVnd: 0, features: ["Core kitchen tools"], active: true },
  {
    name: "Pro",
    tier: "pro",
    priceVnd: 99000,
    features: ["AI suggestions", "Unlimited households", "Priority support"],
    active: true,
  },
];

/**
 * Guarded developer utilities: seeding plans/recipes and resetting dev data.
 * These MUST be impossible in production — every action hard-fails when
 * `NODE_ENV=production`, so a misfired call can never wipe or mutate real data.
 * Reset is scoped to the collections the tools own (plans, user subscriptions,
 * system-scoped recipes, and integration settings); it never touches accounts.
 */
@Injectable()
export class DevToolsService {
  private readonly isProduction: boolean;

  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    private readonly plans: SubscriptionPlanRepository,
    @InjectModel(Recipe.name) private readonly recipeModel: Model<Recipe>,
    @InjectModel(UserSubscription.name)
    private readonly subscriptionModel: Model<UserSubscription>,
    @InjectModel(SystemSetting.name)
    private readonly settingModel: Model<SystemSetting>,
    private readonly audit: AdminAuditService,
    private readonly recipeSeeder: SystemRecipeSeederService,
  ) {
    this.isProduction = config.NODE_ENV === "production";
  }

  async seedPlans(actorId: string): Promise<DevToolResult> {
    this.assertNonProduction();
    const existing = await this.plans.listAll();
    const tiers = new Set(existing.map((p) => p.tier));
    let affected = 0;
    for (const plan of SEED_PLANS) {
      if (!tiers.has(plan.tier)) {
        await this.plans.create({ ...plan }, actorId);
        affected += 1;
      }
    }
    await this.audit.record(actorId, {
      action: "dev.seed-plans",
      targetType: "subscription_plan",
      after: { affected },
    });
    return { action: "seed-plans", affected };
  }

  /**
   * Seeds the system recipe library from the admin console. The seeding itself
   * lives in {@link SystemRecipeSeederService} (shared with the production seed
   * script); this wrapper only adds the dev-only guard and the audit trail.
   */
  async seedRecipes(actorId: string): Promise<DevToolResult> {
    this.assertNonProduction();
    const result = await this.recipeSeeder.seed(actorId);
    const affected = result.created + result.updated;
    await this.audit.record(actorId, {
      action: "dev.seed-recipes",
      targetType: "recipe",
      after: { affected, ...result },
    });
    return { action: "seed-recipes", affected };
  }

  /**
   * Wipes the dev-owned data set (plans, user subscriptions, system recipes, and
   * integration settings). Hard-deletes by design — this is a dev convenience,
   * never reachable in production. Audited with the acting admin so even a
   * destructive dev reset leaves a trail.
   */
  async resetDevData(actorId: string): Promise<DevToolResult> {
    this.assertNonProduction();
    const results = await Promise.all([
      this.plans.hardDeleteAll(),
      this.subscriptionModel.deleteMany({}).exec(),
      this.recipeModel.deleteMany({ scope: "system" }).exec(),
      this.settingModel.deleteMany({}).exec(),
    ]);
    const affected =
      results[0] +
      results[1].deletedCount +
      results[2].deletedCount +
      results[3].deletedCount;
    await this.audit.record(actorId, {
      action: "dev.reset",
      targetType: "dev-data",
      after: {
        affected,
        collections: [
          "subscription_plans",
          "user_subscriptions",
          "recipes(system)",
          "system_settings",
        ],
      },
    });
    return { action: "reset-dev-data", affected };
  }

  private assertNonProduction(): void {
    if (this.isProduction) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: "Developer tools are disabled in production",
      });
    }
  }
}
