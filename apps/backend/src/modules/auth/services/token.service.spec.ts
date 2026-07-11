import { UnauthorizedException } from "@nestjs/common";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose, { Connection, Model } from "mongoose";
import { AppLogger } from "../../../common/logging/app-logger.service";
import type { AppConfig } from "../../../config/env.schema";
import {
  RefreshTokenEntity,
  RefreshTokenRepository,
} from "../repositories/refresh-token.repository";
import { UserEntity, UserRepository } from "../repositories/user.repository";
import {
  RefreshToken,
  RefreshTokenSchema,
} from "../schemas/refresh-token.schema";
import { User, UserSchema } from "../schemas/user.schema";
import { TokenService, toTokenSubject } from "./token.service";

// Only the fields the logger and token service actually read are needed here.
const config = {
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
} as unknown as AppConfig;

describe("TokenService rotation and reuse detection", () => {
  let mongo: MongoMemoryServer;
  let connection: Connection;
  let service: TokenService;
  let users: UserRepository;
  let refreshTokens: RefreshTokenRepository;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    connection = mongoose.createConnection(mongo.getUri());
    await connection.asPromise();

    // SchemaFactory types schemas to the plain class; cast the resulting models
    // to the persisted entity type (class + platform base fields).
    const userModel = connection.model(
      User.name,
      UserSchema,
    ) as unknown as Model<UserEntity>;
    const refreshModel = connection.model(
      RefreshToken.name,
      RefreshTokenSchema,
    ) as unknown as Model<RefreshTokenEntity>;
    users = new UserRepository(userModel);
    refreshTokens = new RefreshTokenRepository(refreshModel);
    service = new TokenService(config, new AppLogger(config), refreshTokens, users);
  });

  afterAll(async () => {
    await connection.close();
    await mongo.stop();
  });

  afterEach(async () => {
    await connection.dropDatabase();
  });

  async function newUser() {
    return users.create({
      email: "rotate@example.com",
      displayName: "Rotate",
      roles: ["user"],
      locale: "vi",
    });
  }

  it("issues a verifiable access token carrying the subject claims", async () => {
    const user = await newUser();
    const pair = await service.issueTokenPair(toTokenSubject(user));

    const payload = service.verifyAccessToken(pair.accessToken);
    expect(payload.sub).toBe(user.id);
    expect(payload.roles).toEqual(["user"]);
    expect(pair.expiresIn).toBe(15 * 60);
  });

  it("rotates a refresh token into a fresh one and consumes the old", async () => {
    const user = await newUser();
    const first = await service.issueTokenPair(toTokenSubject(user));

    const { tokens: second } = await service.rotate(first.refreshToken);
    expect(second.refreshToken).not.toBe(first.refreshToken);

    // The new token works for a subsequent rotation.
    const { tokens: third } = await service.rotate(second.refreshToken);
    expect(third.refreshToken).not.toBe(second.refreshToken);
  });

  it("revokes the entire family when a rotated-out token is replayed", async () => {
    const user = await newUser();
    const first = await service.issueTokenPair(toTokenSubject(user));
    const { tokens: second } = await service.rotate(first.refreshToken);

    // Replaying the already-rotated first token is treated as theft.
    await expect(service.rotate(first.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    // The legitimate successor is now dead too — the whole family is revoked.
    await expect(service.rotate(second.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    const remaining = await refreshTokens.find({ revokedAt: null });
    expect(remaining).toHaveLength(0);
  });

  it("lets only one of two concurrent refreshes of the same token succeed", async () => {
    const user = await newUser();
    const pair = await service.issueTokenPair(toTokenSubject(user));

    const results = await Promise.allSettled([
      service.rotate(pair.refreshToken),
      service.rotate(pair.refreshToken),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    // Exactly one request may mint a successor; the other is treated as reuse.
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    // The family never splits into two live successors — at most one token is
    // still usable, and the presented token is consumed either way.
    const live = await refreshTokens.find({ rotatedAt: null, revokedAt: null });
    expect(live.length).toBeLessThanOrEqual(1);
  });

  it("rejects an unknown refresh token", async () => {
    await expect(service.rotate("not-a-real-token")).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("revokes a family on logout so its token can no longer rotate", async () => {
    const user = await newUser();
    const pair = await service.issueTokenPair(toTokenSubject(user));

    await service.revokeByToken(pair.refreshToken);

    await expect(service.rotate(pair.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
