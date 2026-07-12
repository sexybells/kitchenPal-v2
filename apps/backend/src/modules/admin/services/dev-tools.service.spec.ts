import { ForbiddenException } from "@nestjs/common";
import type { Model } from "mongoose";
import type { AppConfig } from "../../../config/env.schema";
import type { SubscriptionPlanRepository } from "../../subscriptions/repositories/subscription-plan.repository";
import type { UserSubscription } from "../../subscriptions/schemas/user-subscription.schema";
import type { Recipe } from "../../recipes/schemas/recipe.schema";
import type { SystemSetting } from "../schemas/system-setting.schema";
import type { AdminAuditService } from "./admin-audit.service";
import { DevToolsService } from "./dev-tools.service";

/** Deps are never touched when the guard fires, so empty stubs are sufficient. */
function buildService(nodeEnv: AppConfig["NODE_ENV"]): DevToolsService {
  const config = { NODE_ENV: nodeEnv } as AppConfig;
  const plans = {} as SubscriptionPlanRepository;
  const recipeModel = {} as Model<Recipe>;
  const subscriptionModel = {} as Model<UserSubscription>;
  const settingModel = {} as Model<SystemSetting>;
  const audit = {} as AdminAuditService;
  return new DevToolsService(
    config,
    plans,
    recipeModel,
    subscriptionModel,
    settingModel,
    audit,
  );
}

describe("DevToolsService production guard", () => {
  it("hard-fails every dev action when NODE_ENV=production", async () => {
    const service = buildService("production");
    await expect(service.seedPlans("admin")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.seedRecipes("admin")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.resetDevData("admin")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
