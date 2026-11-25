import { ConflictException } from "@nestjs/common";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose, { Connection, Model } from "mongoose";
import type { ScopeContext } from "../../common/scope/scope-context";
import type { UserRepository } from "../auth/repositories/user.repository";
import type { TipsStateRepository } from "./repositories/tips-state.repository";
import {
  UserSettingsEntity,
  UserSettingsRepository,
} from "./repositories/user-settings.repository";
import { UserSettings, UserSettingsSchema } from "./schemas/user-settings.schema";
import { UsersService } from "./users.service";

describe("UsersService settings writes", () => {
  let mongo: MongoMemoryServer;
  let connection: Connection;
  let settings: UserSettingsRepository;
  let service: UsersService;
  let scope: ScopeContext;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    connection = mongoose.createConnection(mongo.getUri());
    await connection.asPromise();
    settings = new UserSettingsRepository(
      connection.model(
        UserSettings.name,
        UserSettingsSchema,
      ) as unknown as Model<UserSettingsEntity>,
    );
    service = new UsersService(
      settings,
      {} as TipsStateRepository,
      { findById: async () => null } as unknown as UserRepository,
    );
  });

  afterAll(async () => {
    await connection.close();
    await mongo.stop();
  });

  beforeEach(async () => {
    jest.restoreAllMocks();
    scope = { scope: "personal", userId: new mongoose.Types.ObjectId().toHexString() };
    await settings.create(scope, {});
  });

  /** Lands `competing` between this request's read and its first write. */
  function raceFirstWrite(competing: () => Promise<unknown>) {
    const original = settings.updateWithVersion.bind(settings);
    return jest
      .spyOn(settings, "updateWithVersion")
      .mockImplementationOnce(async (...args) => {
        jest.spyOn(settings, "updateWithVersion").mockImplementation(original);
        await competing();
        return original(...args);
      });
  }

  it("keeps a push token registered while a time zone PATCH wins the race", async () => {
    const write = raceFirstWrite(() =>
      service.updateSettings(scope, { timeZone: "Europe/Berlin" }),
    );

    await service.addPushToken(scope, { token: "tok-1", platform: "ios" });

    expect(write).toHaveBeenCalled();
    const stored = await settings.findOne(scope);
    expect(stored?.timeZone).toBe("Europe/Berlin");
    expect(stored?.pushTokens.map((entry) => entry.token)).toEqual(["tok-1"]);
  });

  it("keeps a time zone PATCH while a push token registration wins the race", async () => {
    raceFirstWrite(() => service.addPushToken(scope, { token: "tok-2", platform: "android" }));

    const response = await service.updateSettings(scope, { timeZone: "Asia/Tokyo" });

    expect(response.timeZone).toBe("Asia/Tokyo");
    const stored = await settings.findOne(scope);
    expect(stored?.timeZone).toBe("Asia/Tokyo");
    expect(stored?.pushTokens.map((entry) => entry.token)).toEqual(["tok-2"]);
  });

  it("re-merges notifications from the fresh document on retry", async () => {
    raceFirstWrite(() =>
      service.updateSettings(scope, { notifications: { email: false } }),
    );

    await service.updateSettings(scope, { notifications: { mealReminders: false } });

    const stored = await settings.findOne(scope);
    expect(stored?.notifications.email).toBe(false);
    expect(stored?.notifications.mealReminders).toBe(false);
  });

  it("surfaces a second consecutive conflict", async () => {
    const original = settings.updateWithVersion.bind(settings);
    jest.spyOn(settings, "updateWithVersion").mockImplementation(async (...args) => {
      const doc = await settings.findOne(scope);
      await original(scope, doc!.id, doc!.version, { theme: "dark" });
      return original(...args);
    });

    await expect(
      service.updateSettings(scope, { timeZone: "Asia/Tokyo" }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
