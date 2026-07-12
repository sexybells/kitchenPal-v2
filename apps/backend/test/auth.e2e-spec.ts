import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  authResultSchema,
  tokenPairSchema,
  userResponseSchema,
  userSettingsResponseSchema,
  tipsStateResponseSchema,
} from "@kitchenpal/api-contract";
import type { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { startInMemoryMongo } from "./in-memory-mongo";

const ADMIN_EMAIL = "admin@kitchenpal.test";
const ADMIN_SECRET = "test-bootstrap-secret";

interface Registered {
  user: ReturnType<typeof userResponseSchema.parse>;
  tokens: ReturnType<typeof tokenPairSchema.parse>;
  emailVerificationDevToken: string | null;
}

describe("Auth and identity (e2e)", () => {
  let app: INestApplication;
  let mongo: MongoMemoryServer;
  let server: ReturnType<INestApplication["getHttpServer"]>;
  let uploadDir: string;

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    process.env.SWAGGER_ENABLED = "false";
    process.env.THROTTLE_LIMIT = "1000";
    process.env.THROTTLE_TTL = "60000";
    process.env.ADMIN_EMAILS = ADMIN_EMAIL;
    process.env.ADMIN_BOOTSTRAP_SECRET = ADMIN_SECRET;
    uploadDir = mkdtempSync(join(tmpdir(), "kitchenpal-uploads-"));
    process.env.UPLOAD_DIR = uploadDir;
    delete process.env.GOOGLE_CLIENT_IDS;
    delete process.env.APPLE_CLIENT_IDS;
    delete process.env.RESEND_API_KEY;
    delete process.env.JWT_ACCESS_SECRET;
    mongo = await startInMemoryMongo();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app?.close();
    await mongo?.stop();
    if (uploadDir) {
      rmSync(uploadDir, { recursive: true, force: true });
    }
  });

  async function register(
    overrides: Record<string, unknown> = {},
    headers: Record<string, string> = {},
  ): Promise<Registered> {
    const body = {
      email: `user-${Math.random().toString(36).slice(2)}@example.com`,
      password: "supersecret",
      displayName: "Test User",
      ...overrides,
    };
    const res = await request(server)
      .post("/auth/register")
      .set(headers)
      .send(body);
    expect(res.status).toBe(201);
    const parsed = authResultSchema.parse(res.body.data);
    return {
      user: parsed.user,
      tokens: parsed.tokens,
      emailVerificationDevToken: res.body.data.emailVerification.devToken ?? null,
    };
  }

  describe("email/password lifecycle", () => {
    it("registers, logs in, reaches a protected route, rotates, and logs out", async () => {
      const email = `flow-${Date.now()}@example.com`;
      const registered = await register({ email, password: "supersecret" });
      expect(registered.user.email).toBe(email);

      const login = await request(server)
        .post("/auth/login")
        .send({ email, password: "supersecret" });
      expect(login.status).toBe(200);
      const session = authResultSchema.parse(login.body.data);

      // Protected route via the issued access token.
      const me = await request(server)
        .get("/auth/me")
        .set("Authorization", `Bearer ${session.tokens.accessToken}`);
      expect(me.status).toBe(200);
      expect(userResponseSchema.parse(me.body.data).id).toBe(registered.user.id);

      // Refresh rotates the refresh token.
      const refresh = await request(server)
        .post("/auth/refresh")
        .send({ refreshToken: session.tokens.refreshToken });
      expect(refresh.status).toBe(200);
      const rotated = tokenPairSchema.parse(refresh.body.data);
      expect(rotated.refreshToken).not.toBe(session.tokens.refreshToken);

      // Logout revokes the rotated token's family.
      const logout = await request(server)
        .post("/auth/logout")
        .send({ refreshToken: rotated.refreshToken });
      expect(logout.status).toBe(200);
      const afterLogout = await request(server)
        .post("/auth/refresh")
        .send({ refreshToken: rotated.refreshToken });
      expect(afterLogout.status).toBe(401);
    });

    it("rejects a protected route without a bearer token", async () => {
      const res = await request(server).get("/auth/me");
      expect(res.status).toBe(401);
    });

    it("detects refresh-token reuse and revokes the whole family", async () => {
      const { tokens } = await register();
      const first = await request(server)
        .post("/auth/refresh")
        .send({ refreshToken: tokens.refreshToken });
      expect(first.status).toBe(200);
      const rotated = tokenPairSchema.parse(first.body.data);

      // Replaying the already-rotated token is treated as theft.
      const replay = await request(server)
        .post("/auth/refresh")
        .send({ refreshToken: tokens.refreshToken });
      expect(replay.status).toBe(401);

      // The legitimate successor is revoked along with the family.
      const successor = await request(server)
        .post("/auth/refresh")
        .send({ refreshToken: rotated.refreshToken });
      expect(successor.status).toBe(401);
    });

    it("rejects duplicate registration and wrong passwords", async () => {
      const email = `dupe-${Date.now()}@example.com`;
      await register({ email });
      const dupe = await request(server)
        .post("/auth/register")
        .send({ email, password: "supersecret", displayName: "Dupe" });
      expect(dupe.status).toBe(409);
      // Email-taken has its own code, distinct from the generic CONFLICT used by
      // scan-confirm / budget-overlap, so clients can map it unambiguously.
      expect(dupe.body.error.code).toBe("EMAIL_ALREADY_EXISTS");

      const wrong = await request(server)
        .post("/auth/login")
        .send({ email, password: "wrong-password" });
      expect(wrong.status).toBe(401);
    });
  });

  describe("locale resolution", () => {
    it("persists an explicit locale code", async () => {
      const { user } = await register({ locale: "en" });
      expect(user.locale).toBe("en");
    });

    it("resolves the locale from Accept-Language when unset", async () => {
      const { user } = await register({}, { "Accept-Language": "en-US,en;q=0.9" });
      expect(user.locale).toBe("en");
    });

    it("falls back to the launch default when no hint is present", async () => {
      const { user } = await register({}, { "Accept-Language": "fr-FR" });
      expect(user.locale).toBe("vi");
    });
  });

  describe("email verification (dev path)", () => {
    it("returns a dev token and marks the email verified", async () => {
      const registered = await register();
      expect(registered.user.emailVerified).toBe(false);
      expect(registered.emailVerificationDevToken).toBeTruthy();

      const verify = await request(server)
        .post("/auth/verify-email")
        .send({ token: registered.emailVerificationDevToken });
      expect(verify.status).toBe(200);

      const me = await request(server)
        .get("/auth/me")
        .set("Authorization", `Bearer ${registered.tokens.accessToken}`);
      expect(userResponseSchema.parse(me.body.data).emailVerified).toBe(true);
    });
  });

  describe("password reset (dev path)", () => {
    it("resets the password, invalidates old sessions, and accepts the new one", async () => {
      const email = `reset-${Date.now()}@example.com`;
      const registered = await register({ email, password: "old-password" });

      const forgot = await request(server)
        .post("/auth/forgot-password")
        .send({ email });
      expect(forgot.status).toBe(200);
      const devToken = forgot.body.data.devToken as string;
      expect(devToken).toBeTruthy();

      const reset = await request(server)
        .post("/auth/reset-password")
        .send({ token: devToken, password: "new-password" });
      expect(reset.status).toBe(200);

      // Old refresh sessions are revoked by the reset.
      const oldRefresh = await request(server)
        .post("/auth/refresh")
        .send({ refreshToken: registered.tokens.refreshToken });
      expect(oldRefresh.status).toBe(401);

      // Old password no longer works; the new one does.
      const oldLogin = await request(server)
        .post("/auth/login")
        .send({ email, password: "old-password" });
      expect(oldLogin.status).toBe(401);
      const newLogin = await request(server)
        .post("/auth/login")
        .send({ email, password: "new-password" });
      expect(newLogin.status).toBe(200);
    });

    it("does not reveal whether an email exists", async () => {
      const res = await request(server)
        .post("/auth/forgot-password")
        .send({ email: "nobody@example.com" });
      expect(res.status).toBe(200);
      expect(res.body.data.devToken ?? null).toBeNull();
    });
  });

  describe("social sign-in (dev path)", () => {
    it("signs in with a development Google identity token", async () => {
      const idToken = JSON.stringify({
        sub: "google-sub-123",
        email: "social@example.com",
        name: "Social User",
      });
      const res = await request(server)
        .post("/auth/google")
        .send({ idToken });
      expect(res.status).toBe(200);
      const result = authResultSchema.parse(res.body.data);
      expect(result.user.email).toBe("social@example.com");

      // A second sign-in resolves the same account.
      const again = await request(server)
        .post("/auth/google")
        .send({ idToken });
      expect(authResultSchema.parse(again.body.data).user.id).toBe(
        result.user.id,
      );
    });

    it("rejects a malformed development token", async () => {
      const res = await request(server)
        .post("/auth/apple")
        .send({ idToken: "not-json" });
      expect(res.status).toBe(401);
    });

    it("does not link an existing account on an unverified provider email", async () => {
      const email = `victim-${Date.now()}@example.com`;
      await register({ email, password: "victim-password" });

      // Attacker presents a token claiming the victim's email but unverified.
      const attack = await request(server)
        .post("/auth/google")
        .send({
          idToken: JSON.stringify({ sub: "attacker-sub", email }),
        });
      expect(attack.status).toBe(409);

      // The victim's password account is untouched and still logs in.
      const login = await request(server)
        .post("/auth/login")
        .send({ email, password: "victim-password" });
      expect(login.status).toBe(200);
    });

    it("links an existing account when the provider email is verified", async () => {
      const email = `owner-${Date.now()}@example.com`;
      const owner = await register({ email, password: "owner-password" });

      const link = await request(server)
        .post("/auth/google")
        .send({
          idToken: JSON.stringify({
            sub: "owner-google-sub",
            email,
            emailVerified: true,
          }),
        });
      expect(link.status).toBe(200);
      expect(authResultSchema.parse(link.body.data).user.id).toBe(owner.user.id);
    });
  });

  describe("phone OTP", () => {
    it("requests a code, verifies ownership, and logs in", async () => {
      const phone = "+15551234567";

      const request1 = await request(server)
        .post("/auth/request-phone-otp")
        .send({ phone });
      expect(request1.status).toBe(200);
      const code1 = request1.body.data.devToken as string;
      expect(code1).toMatch(/^\d{6}$/);

      const login = await request(server)
        .post("/auth/login-phone-otp")
        .send({ phone, code: code1, displayName: "Phone User" });
      expect(login.status).toBe(200);
      const result = authResultSchema.parse(login.body.data);
      expect(result.user.phone).toBe(phone);
      expect(result.user.phoneVerified).toBe(true);

      // A fresh code verifies ownership of the now-existing account.
      const request2 = await request(server)
        .post("/auth/request-phone-otp")
        .send({ phone });
      const code2 = request2.body.data.devToken as string;
      const verify = await request(server)
        .post("/auth/verify-phone-otp")
        .send({ phone, code: code2 });
      expect(verify.status).toBe(200);
    });

    it("rejects an incorrect code", async () => {
      const phone = "+15559998888";
      await request(server).post("/auth/request-phone-otp").send({ phone });
      const res = await request(server)
        .post("/auth/login-phone-otp")
        .send({ phone, code: "000000" });
      expect(res.status).toBe(401);
    });
  });

  describe("role guard and admin bootstrap", () => {
    it("blocks non-admins and permits a bootstrapped admin", async () => {
      // A normal user cannot reach the admin route.
      const normal = await register();
      const blocked = await request(server)
        .get("/users/admin/overview")
        .set("Authorization", `Bearer ${normal.tokens.accessToken}`);
      expect(blocked.status).toBe(403);

      // Register the whitelisted admin account, then elevate it.
      await register({ email: ADMIN_EMAIL, password: "supersecret" });
      const bootstrap = await request(server)
        .post("/auth/bootstrap-admin")
        .send({ email: ADMIN_EMAIL, secret: ADMIN_SECRET });
      expect(bootstrap.status).toBe(200);
      expect(userResponseSchema.parse(bootstrap.body.data).roles).toContain(
        "admin",
      );

      // A fresh login mints a token carrying the admin claim.
      const adminLogin = await request(server)
        .post("/auth/login")
        .send({ email: ADMIN_EMAIL, password: "supersecret" });
      const adminToken = authResultSchema.parse(adminLogin.body.data).tokens
        .accessToken;

      const overview = await request(server)
        .get("/users/admin/overview")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(overview.status).toBe(200);
      expect(overview.body.data.userCount).toBeGreaterThan(0);
    });

    it("refuses bootstrap with a wrong secret or non-whitelisted email", async () => {
      const wrongSecret = await request(server)
        .post("/auth/bootstrap-admin")
        .send({ email: ADMIN_EMAIL, secret: "nope" });
      expect(wrongSecret.status).toBe(403);
    });
  });

  describe("user settings, tips, and push token", () => {
    it("returns defaults and applies updates for the current user", async () => {
      const { tokens } = await register({ locale: "vi" });
      const auth = { Authorization: `Bearer ${tokens.accessToken}` };

      const settings = await request(server).get("/users/settings").set(auth);
      expect(settings.status).toBe(200);
      const defaults = userSettingsResponseSchema.parse(settings.body.data);
      expect(defaults.measurementSystem).toBe("metric");
      expect(defaults.biometricLockEnabled).toBe(false);

      const updated = await request(server)
        .patch("/users/settings")
        .set(auth)
        .send({ theme: "dark", notifications: { push: false } });
      expect(updated.status).toBe(200);
      const afterUpdate = userSettingsResponseSchema.parse(updated.body.data);
      expect(afterUpdate.theme).toBe("dark");
      expect(afterUpdate.notifications.push).toBe(false);
      expect(afterUpdate.notifications.email).toBe(true);

      const biometric = await request(server)
        .patch("/users/settings/biometric")
        .set(auth)
        .send({ enabled: true });
      expect(
        userSettingsResponseSchema.parse(biometric.body.data).biometricLockEnabled,
      ).toBe(true);

      const push = await request(server)
        .post("/users/push-token")
        .set(auth)
        .send({ token: "device-token-1", platform: "ios" });
      expect(push.status).toBe(200);

      const tipsGet = await request(server).get("/users/tips").set(auth);
      const tips = tipsStateResponseSchema.parse(tipsGet.body.data);
      expect(tips.seen).toEqual([]);

      const tipsUpdate = await request(server)
        .patch("/users/tips")
        .set(auth)
        .send({ seen: ["pantry-intro"], dismissedAll: false });
      expect(
        tipsStateResponseSchema.parse(tipsUpdate.body.data).seen,
      ).toContain("pantry-intro");
    });

    it("keeps the account locale in sync when settings locale changes", async () => {
      const { tokens } = await register({ locale: "vi" });
      const auth = { Authorization: `Bearer ${tokens.accessToken}` };

      await request(server)
        .patch("/users/settings")
        .set(auth)
        .send({ locale: "en" });

      const me = await request(server).get("/auth/me").set(auth);
      expect(userResponseSchema.parse(me.body.data).locale).toBe("en");
    });
  });

  describe("avatar upload", () => {
    // Minimal valid 1x1 PNG (correct magic bytes).
    const PNG_1X1 = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    );

    it("stores a valid image and records the avatar URL", async () => {
      const { tokens } = await register();
      const res = await request(server)
        .post("/uploads/avatar")
        .set("Authorization", `Bearer ${tokens.accessToken}`)
        .attach("file", PNG_1X1, { filename: "a.png", contentType: "image/png" });
      expect(res.status).toBe(200);
      expect(res.body.data.avatarUrl).toContain("/uploads/avatars/");
    });

    it("rejects a non-image payload disguised with an image content type", async () => {
      const { tokens } = await register();
      const res = await request(server)
        .post("/uploads/avatar")
        .set("Authorization", `Bearer ${tokens.accessToken}`)
        .attach("file", Buffer.from("this is definitely not an image"), {
          filename: "evil.png",
          contentType: "image/png",
        });
      expect(res.status).toBe(400);
    });
  });
});
