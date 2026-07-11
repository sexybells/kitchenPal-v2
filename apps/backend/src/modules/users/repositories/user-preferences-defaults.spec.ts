import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose, { Connection, Model } from "mongoose";
import type { ScopeContext } from "../../../common/scope/scope-context";
import { TipsState, TipsStateSchema } from "../schemas/tips-state.schema";
import {
  UserSettings,
  UserSettingsSchema,
} from "../schemas/user-settings.schema";
import {
  TipsStateEntity,
  TipsStateRepository,
} from "./tips-state.repository";
import {
  UserSettingsEntity,
  UserSettingsRepository,
} from "./user-settings.repository";

describe("user preference defaults", () => {
  let mongo: MongoMemoryServer;
  let connection: Connection;
  let settings: UserSettingsRepository;
  let tips: TipsStateRepository;

  const scope: ScopeContext = {
    scope: "personal",
    userId: new mongoose.Types.ObjectId().toHexString(),
  };

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    connection = mongoose.createConnection(mongo.getUri());
    await connection.asPromise();

    // SchemaFactory types schemas to the plain class; cast to the persisted
    // entity type (class + scoped/base platform fields).
    settings = new UserSettingsRepository(
      connection.model(
        UserSettings.name,
        UserSettingsSchema,
      ) as unknown as Model<UserSettingsEntity>,
    );
    tips = new TipsStateRepository(
      connection.model(
        TipsState.name,
        TipsStateSchema,
      ) as unknown as Model<TipsStateEntity>,
    );
  });

  afterAll(async () => {
    await connection.close();
    await mongo.stop();
  });

  it("creates settings with sensible personal-scoped defaults", async () => {
    const created = await settings.create(scope, {});

    expect(created.scope).toBe("personal");
    expect(String(created.createdBy)).toBe(scope.userId);
    expect(created.measurementSystem).toBe("metric");
    expect(created.theme).toBe("system");
    expect(created.biometricLockEnabled).toBe(false);
    expect(created.pushTokens).toEqual([]);
    expect(created.notifications.push).toBe(true);
    expect(created.notifications.shoppingReminders).toBe(true);
  });

  it("creates tips state empty and not dismissed", async () => {
    const created = await tips.create(scope, {});

    expect(created.scope).toBe("personal");
    expect(created.seen).toEqual([]);
    expect(created.dismissedAll).toBe(false);
  });
});
