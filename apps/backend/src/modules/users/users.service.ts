import { ConflictException, Injectable } from "@nestjs/common";
import type {
  BiometricSettingInput,
  Locale,
  PushTokenInput,
  TipsStateResponse,
  UpdateSettingsInput,
  UpdateTipsInput,
  UserSettingsResponse,
} from "@kitchenpal/api-contract";
import type { HydratedDocument } from "mongoose";
import { ErrorCode } from "../../common/http/error-codes";
import type { ScopeContext } from "../../common/scope/scope-context";
import { UserRepository } from "../auth/repositories/user.repository";
import {
  TipsStateEntity,
  TipsStateRepository,
} from "./repositories/tips-state.repository";
import {
  UserSettingsEntity,
  UserSettingsRepository,
} from "./repositories/user-settings.repository";

function toSettingsResponse(
  doc: HydratedDocument<UserSettingsEntity>,
): UserSettingsResponse {
  return {
    locale: doc.locale,
    measurementSystem: doc.measurementSystem,
    theme: doc.theme,
    notifications: {
      push: doc.notifications.push,
      email: doc.notifications.email,
      mealReminders: doc.notifications.mealReminders,
      shoppingReminders: doc.notifications.shoppingReminders,
    },
    biometricLockEnabled: doc.biometricLockEnabled,
    observesVegetarianDays: doc.observesVegetarianDays,
    timeZone: doc.timeZone,
  };
}

/** Whether an error is the repository's optimistic-lock 409 (stale version). */
function isOptimisticLockConflict(error: unknown): boolean {
  if (!(error instanceof ConflictException)) {
    return false;
  }
  const response = error.getResponse();
  return (
    typeof response === "object" &&
    response !== null &&
    (response as { code?: string }).code === ErrorCode.OPTIMISTIC_LOCK_CONFLICT
  );
}

function toTipsResponse(
  doc: HydratedDocument<TipsStateEntity>,
): TipsStateResponse {
  return { seen: doc.seen, dismissedAll: doc.dismissedAll };
}

/**
 * Owns per-user preferences: settings, biometric lock, push tokens, and tips.
 * Every document is personal-scoped, so the injected {@link ScopeContext}
 * guarantees a caller only ever touches their own records. Settings/tips are
 * created lazily with defaults on first access.
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly settings: UserSettingsRepository,
    private readonly tips: TipsStateRepository,
    private readonly users: UserRepository,
  ) {}

  async getSettings(scope: ScopeContext): Promise<UserSettingsResponse> {
    return toSettingsResponse(await this.getOrCreateSettings(scope));
  }

  async updateSettings(
    scope: ScopeContext,
    input: UpdateSettingsInput,
  ): Promise<UserSettingsResponse> {
    const updated = await this.writeSettings(scope, (doc) => {
      const update: Record<string, unknown> = {};
      if (input.locale) {
        update.locale = input.locale;
      }
      if (input.measurementSystem) {
        update.measurementSystem = input.measurementSystem;
      }
      if (input.theme) {
        update.theme = input.theme;
      }
      if (input.notifications) {
        const current = doc.notifications;
        update.notifications = {
          push: input.notifications.push ?? current.push,
          email: input.notifications.email ?? current.email,
          mealReminders: input.notifications.mealReminders ?? current.mealReminders,
          shoppingReminders:
            input.notifications.shoppingReminders ?? current.shoppingReminders,
        };
      }
      if (input.observesVegetarianDays !== undefined) {
        update.observesVegetarianDays = input.observesVegetarianDays;
      }
      if (input.timeZone) {
        update.timeZone = input.timeZone;
      }
      return update;
    });
    if (input.locale) {
      await this.syncUserLocale(scope.userId, input.locale);
    }
    return toSettingsResponse(updated);
  }

  async setBiometric(
    scope: ScopeContext,
    input: BiometricSettingInput,
  ): Promise<UserSettingsResponse> {
    const doc = await this.getOrCreateSettings(scope);
    const updated = await this.settings.updateWithVersion(scope, doc.id, doc.version, {
      biometricLockEnabled: input.enabled,
    });
    return toSettingsResponse(updated);
  }

  async addPushToken(
    scope: ScopeContext,
    input: PushTokenInput,
  ): Promise<UserSettingsResponse> {
    // Replace any existing entry with the same token so re-registration on a new
    // platform stays idempotent and never duplicates a device.
    const updated = await this.writeSettings(scope, (doc) => ({
      pushTokens: [
        ...doc.pushTokens.filter((entry) => entry.token !== input.token),
        { token: input.token, platform: input.platform },
      ],
    }));
    return toSettingsResponse(updated);
  }

  async getTips(scope: ScopeContext): Promise<TipsStateResponse> {
    return toTipsResponse(await this.getOrCreateTips(scope));
  }

  /** Admin-only snapshot; guarded by the role guard at the route. */
  async adminOverview(): Promise<{ userCount: number }> {
    return { userCount: await this.users.count() };
  }

  async updateTips(
    scope: ScopeContext,
    input: UpdateTipsInput,
  ): Promise<TipsStateResponse> {
    const doc = await this.getOrCreateTips(scope);
    const update: Record<string, unknown> = {};
    if (input.seen) {
      // Union of already-seen and newly-seen tip ids.
      update.seen = Array.from(new Set([...doc.seen, ...input.seen]));
    }
    if (input.dismissedAll !== undefined) {
      update.dismissedAll = input.dismissedAll;
    }
    const updated = await this.tips.updateWithVersion(
      scope,
      doc.id,
      doc.version,
      update,
    );
    return toTipsResponse(updated);
  }

  private async getOrCreateSettings(
    scope: ScopeContext,
  ): Promise<HydratedDocument<UserSettingsEntity>> {
    const existing = await this.settings.findOne(scope);
    if (existing) {
      return existing;
    }
    const user = await this.users.findById(scope.userId);
    return this.settings.create(scope, {
      locale: user?.locale ?? "vi",
    } as Partial<UserSettingsEntity>);
  }

  /**
   * Versioned settings write that re-reads and re-applies once on an
   * optimistic-lock conflict. At app launch the time zone sync and the push
   * token registration race on the same document; both are partial merges
   * rebuilt from the fresh document, so one retry is safe. A second conflict
   * still surfaces as 409.
   */
  private async writeSettings(
    scope: ScopeContext,
    buildUpdate: (doc: HydratedDocument<UserSettingsEntity>) => Record<string, unknown>,
  ): Promise<HydratedDocument<UserSettingsEntity>> {
    const write = async () => {
      const doc = await this.getOrCreateSettings(scope);
      return this.settings.updateWithVersion(scope, doc.id, doc.version, buildUpdate(doc));
    };
    try {
      return await write();
    } catch (error) {
      if (!isOptimisticLockConflict(error)) {
        throw error;
      }
      return write();
    }
  }

  private async getOrCreateTips(
    scope: ScopeContext,
  ): Promise<HydratedDocument<TipsStateEntity>> {
    const existing = await this.tips.findOne(scope);
    if (existing) {
      return existing;
    }
    return this.tips.create(scope, {} as Partial<TipsStateEntity>);
  }

  private async syncUserLocale(userId: string, locale: Locale): Promise<void> {
    const user = await this.users.findById(userId);
    if (user && user.locale !== locale) {
      await this.users.updateWithVersion(user.id, user.version, { locale }, user.id);
    }
  }
}
