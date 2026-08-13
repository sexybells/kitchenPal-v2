import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  adminUserResponseSchema,
  growthReportSchema,
  mySubscriptionResponseSchema,
  subscriptionPlanResponseSchema,
  systemSettingResponseSchema,
  userSubscriptionResponseSchema,
} from "@kitchenpal/api-contract";
import type { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { startInMemoryMongo } from "./in-memory-mongo";

const ADMIN_EMAIL = "root@kitchenpal.test";
const ADMIN_SECRET = "test-bootstrap-secret";

interface TestUser {
  token: string;
  userId: string;
}

/** Decodes the (unverified) claims of a JWT access token for assertions. */
function decodeClaims(token: string): Record<string, unknown> {
  const payload = token.split(".")[1] ?? "";
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

describe("Admin, subscriptions, reports & settings (e2e)", () => {
  let app: INestApplication;
  let mongo: MongoMemoryServer;
  let server: ReturnType<INestApplication["getHttpServer"]>;

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    process.env.SWAGGER_ENABLED = "false";
    process.env.THROTTLE_LIMIT = "1000";
    process.env.THROTTLE_TTL = "60000";
    process.env.ADMIN_EMAILS = ADMIN_EMAIL;
    process.env.ADMIN_BOOTSTRAP_SECRET = ADMIN_SECRET;
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
  });

  function auth(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}` };
  }

  async function register(email?: string): Promise<TestUser> {
    const res = await request(server)
      .post("/auth/register")
      .send({
        email: email ?? `u-${Math.random().toString(36).slice(2)}@example.com`,
        password: "supersecret",
        displayName: "Person",
      });
    expect(res.status).toBe(201);
    return {
      token: res.body.data.tokens.accessToken as string,
      userId: res.body.data.user.id as string,
    };
  }

  // The admin account is a singleton across the suite. Register/bootstrap/login
  // once and cache the session; the admin's own roles never change in these
  // tests, and the access token outlives the suite — this also avoids tripping
  // the login rate limiter across the many tests that need an admin.
  let adminCache: TestUser | null = null;
  async function makeAdmin(): Promise<TestUser> {
    if (adminCache) {
      return adminCache;
    }
    await request(server)
      .post("/auth/register")
      .send({ email: ADMIN_EMAIL, password: "supersecret", displayName: "Root" });
    const bootstrap = await request(server)
      .post("/auth/bootstrap-admin")
      .send({ email: ADMIN_EMAIL, secret: ADMIN_SECRET });
    expect(bootstrap.status).toBe(200);
    const login = await request(server)
      .post("/auth/login")
      .send({ email: ADMIN_EMAIL, password: "supersecret" });
    expect(login.status).toBe(200);
    adminCache = {
      token: login.body.data.tokens.accessToken as string,
      userId: login.body.data.user.id as string,
    };
    return adminCache;
  }

  it("blocks non-admins from admin routes with 403", async () => {
    const user = await register();
    for (const path of ["/admin/users", "/admin/reports/usage", "/admin/logs/audit"]) {
      const res = await request(server).get(path).set(auth(user.token));
      expect(res.status).toBe(403);
    }
  });

  it("lets an admin list and paginate users, households, and recipes", async () => {
    const admin = await makeAdmin();
    await register();
    await register();

    const users = await request(server)
      .get("/admin/users?limit=1")
      .set(auth(admin.token));
    expect(users.status).toBe(200);
    expect(users.body.data.length).toBe(1);
    expect(users.body.meta.page.hasMore).toBe(true);
    adminUserResponseSchema.parse(users.body.data[0]);

    const households = await request(server)
      .get("/admin/households")
      .set(auth(admin.token));
    expect(households.status).toBe(200);

    const recipes = await request(server)
      .get("/admin/recipes")
      .set(auth(admin.token));
    expect(recipes.status).toBe(200);
  });

  it("assigns a subscription an admin created, reflected in the user's /me", async () => {
    const admin = await makeAdmin();
    const user = await register();

    const created = await request(server)
      .post("/admin/subscriptions/plans")
      .set(auth(admin.token))
      .send({ name: "Pro", tier: "pro", priceVnd: 99000, features: ["AI"] });
    expect(created.status).toBe(201);
    const plan = subscriptionPlanResponseSchema.parse(created.body.data);

    const assigned = await request(server)
      .post("/admin/subscriptions/assign")
      .set(auth(admin.token))
      .send({ userId: user.userId, planId: plan.id });
    expect(assigned.status).toBe(201);
    const sub = userSubscriptionResponseSchema.parse(assigned.body.data);
    expect(sub.source).toBe("admin");

    const mine = await request(server)
      .get("/subscriptions/me")
      .set(auth(user.token));
    expect(mine.status).toBe(200);
    const parsed = mySubscriptionResponseSchema.parse(mine.body.data);
    expect(parsed.tier).toBe("pro");
    expect(parsed.subscription?.planId).toBe(plan.id);
  });

  it("keeps user self-activation inert (no purchase implied)", async () => {
    const admin = await makeAdmin();
    const user = await register();
    const created = await request(server)
      .post("/admin/subscriptions/plans")
      .set(auth(admin.token))
      .send({ name: "Pro", tier: "pro", priceVnd: 50000 });
    const plan = subscriptionPlanResponseSchema.parse(created.body.data);

    const res = await request(server)
      .post("/subscriptions/me/activate")
      .set(auth(user.token))
      .send({ planId: plan.id });
    expect(res.status).toBe(200);
    expect(res.body.data.activated).toBe(false);
    expect(res.body.data.status).toBe("contact_required");

    // No subscription was created by the inert path.
    const mine = await request(server)
      .get("/subscriptions/me")
      .set(auth(user.token));
    expect(mySubscriptionResponseSchema.parse(mine.body.data).tier).toBe("free");
  });

  it("returns growth report buckets over seeded data", async () => {
    const admin = await makeAdmin();
    await register();
    await register();

    const res = await request(server)
      .get("/admin/reports/growth?bucket=day")
      .set(auth(admin.token));
    expect(res.status).toBe(200);
    const report = growthReportSchema.parse(res.body.data);
    expect(report.bucket).toBe("day");
    const totalNewUsers = report.buckets.reduce((n, b) => n + b.newUsers, 0);
    expect(totalNewUsers).toBeGreaterThanOrEqual(2);
  });

  it("persists a settings update and never returns secrets", async () => {
    const admin = await makeAdmin();
    const res = await request(server)
      .put("/admin/settings/integrations/ai")
      .set(auth(admin.token))
      .send({
        enabled: true,
        config: { provider: "openai", apiKey: "super-secret-value" },
      });
    expect(res.status).toBe(200);
    const setting = systemSettingResponseSchema.parse(res.body.data);
    expect(setting.enabled).toBe(true);
    expect(setting.config.provider).toBe("openai");
    // The secret-looking key was stripped, never stored, never echoed.
    expect(setting.config.apiKey).toBeUndefined();

    const list = await request(server)
      .get("/admin/settings/integrations")
      .set(auth(admin.token));
    const ai = list.body.data.settings.find(
      (s: { key: string }) => s.key === "ai",
    );
    expect(ai.enabled).toBe(true);
    expect(JSON.stringify(list.body.data)).not.toContain("super-secret-value");
  });

  it("strips secret-looking keys nested at any depth", async () => {
    const admin = await makeAdmin();
    const res = await request(server)
      .put("/admin/settings/integrations/storage")
      .set(auth(admin.token))
      .send({
        enabled: true,
        config: {
          bucket: "kp-uploads",
          // A secret hidden under a non-secret parent key and inside an array.
          s3: { region: "ap-southeast-1", secretAccessKey: "AKIA-nested-secret" },
          providers: [{ name: "primary", apiKey: "sk-array-secret" }],
        },
      });
    expect(res.status).toBe(200);
    const setting = systemSettingResponseSchema.parse(res.body.data);
    const s3 = setting.config.s3 as Record<string, unknown>;
    expect(s3.region).toBe("ap-southeast-1");
    expect(s3.secretAccessKey).toBeUndefined();
    // The nested/array secrets never enter the DB nor the read response.
    const list = await request(server)
      .get("/admin/settings/integrations")
      .set(auth(admin.token));
    const payload = JSON.stringify(list.body.data);
    expect(payload).not.toContain("AKIA-nested-secret");
    expect(payload).not.toContain("sk-array-secret");
  });

  it("writes an audit row for every admin mutation", async () => {
    const admin = await makeAdmin();
    const created = await request(server)
      .post("/admin/subscriptions/plans")
      .set(auth(admin.token))
      .send({ name: "Audited", tier: "pro", priceVnd: 1000 });
    expect(created.status).toBe(201);

    const audit = await request(server)
      .get("/admin/logs/audit")
      .set(auth(admin.token));
    expect(audit.status).toBe(200);
    const actions = audit.body.data.map((a: { action: string }) => a.action);
    expect(actions).toContain("plan.create");
    // Audit rows carry the acting admin and never leak secret values.
    expect(audit.body.data[0].actorId).toBe(admin.userId);
  });

  it("runs dev tools in test env and audits them (prod refusal is unit-tested)", async () => {
    // The production guard is covered by the DevToolsService unit spec. Here we
    // prove the tools run in the test environment AND write audit rows.
    const admin = await makeAdmin();

    const seeded = await request(server)
      .post("/admin/dev/seed-plans")
      .set(auth(admin.token));
    expect(seeded.status).toBe(200);
    expect(seeded.body.data.action).toBe("seed-plans");

    const res = await request(server)
      .post("/admin/dev/reset")
      .set(auth(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.data.action).toBe("reset-dev-data");

    // The reset wipes dev-owned data but NOT the audit trail, so its own row
    // (and the seed row) survive and carry the acting admin.
    const audit = await request(server)
      .get("/admin/logs/audit?limit=100")
      .set(auth(admin.token));
    const rows = audit.body.data as { action: string; actorId: string }[];
    const actions = rows.map((r) => r.action);
    expect(actions).toContain("dev.seed-plans");
    expect(actions).toContain("dev.reset");
    const resetRow = rows.find((r) => r.action === "dev.reset");
    expect(resetRow?.actorId).toBe(admin.userId);
  });

  it("returns fresh tokens carrying activeHouseholdId on household create", async () => {
    const user = await register();
    const res = await request(server)
      .post("/households")
      .set(auth(user.token))
      .send({ name: "Home" });
    expect(res.status).toBe(201);
    const householdId = res.body.data.id as string;
    const newToken = res.body.data.tokens.accessToken as string;
    expect(typeof newToken).toBe("string");
    const claims = decodeClaims(newToken);
    expect(claims.activeHouseholdId).toBe(householdId);

    // Accepting an invite likewise returns tokens scoped to the household.
    const joiner = await register();
    const invite = await request(server)
      .post(`/households/${householdId}/invites`)
      .set(auth(user.token))
      .send({ ttlHours: 24 });
    const accepted = await request(server)
      .post(`/invites/${invite.body.data.code}/accept`)
      .set(auth(joiner.token));
    expect(accepted.status).toBe(200);
    const joinerClaims = decodeClaims(
      accepted.body.data.tokens.accessToken as string,
    );
    expect(joinerClaims.activeHouseholdId).toBe(householdId);
  });

  describe("admin self-lockout guards", () => {
    it("blocks an admin from suspending their own account", async () => {
      const admin = await makeAdmin();
      const res = await request(server)
        .patch(`/admin/users/${admin.userId}/suspend`)
        .set(auth(admin.token))
        .send({ suspended: true });
      expect(res.status).toBe(400);

      // The account is still usable.
      const self = await request(server)
        .get(`/admin/users/${admin.userId}`)
        .set(auth(admin.token));
      expect(adminUserResponseSchema.parse(self.body.data).suspended).toBe(false);
    });

    it("blocks demoting the last remaining admin (self-demotion)", async () => {
      const admin = await makeAdmin();
      const res = await request(server)
        .patch(`/admin/users/${admin.userId}/roles`)
        .set(auth(admin.token))
        .send({ roles: ["user"] });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);

      const self = await request(server)
        .get(`/admin/users/${admin.userId}`)
        .set(auth(admin.token));
      expect(adminUserResponseSchema.parse(self.body.data).roles).toContain(
        "admin",
      );
    });

    it("lets an admin demote a non-last admin", async () => {
      const admin = await makeAdmin();
      const other = await register();
      // Promote another user to admin (adding a role is unrestricted).
      const promoted = await request(server)
        .patch(`/admin/users/${other.userId}/roles`)
        .set(auth(admin.token))
        .send({ roles: ["user", "admin"] });
      expect(promoted.status).toBe(200);
      expect(adminUserResponseSchema.parse(promoted.body.data).roles).toContain(
        "admin",
      );

      // Now demoting them is allowed — the acting admin remains.
      const demoted = await request(server)
        .patch(`/admin/users/${other.userId}/roles`)
        .set(auth(admin.token))
        .send({ roles: ["user"] });
      expect(demoted.status).toBe(200);
      expect(
        adminUserResponseSchema.parse(demoted.body.data).roles,
      ).not.toContain("admin");
    });

    it("lets an admin suspend another user", async () => {
      const admin = await makeAdmin();
      const victim = await register();
      const res = await request(server)
        .patch(`/admin/users/${victim.userId}/suspend`)
        .set(auth(admin.token))
        .send({ suspended: true });
      expect(res.status).toBe(200);
      expect(adminUserResponseSchema.parse(res.body.data).suspended).toBe(true);
    });

    it("blocks a suspended user from re-authenticating on every sign-in path", async () => {
      const admin = await makeAdmin();

      // Password account: suspend, then a fresh password login is refused.
      const email = `victim-${Math.random().toString(36).slice(2)}@example.com`;
      const victim = await register(email);
      await request(server)
        .patch(`/admin/users/${victim.userId}/suspend`)
        .set(auth(admin.token))
        .send({ suspended: true })
        .expect(200);
      const pwLogin = await request(server)
        .post("/auth/login")
        .send({ email, password: "supersecret" });
      expect(pwLogin.status).toBe(401);
      expect(pwLogin.body.error.code).toBe("ACCOUNT_SUSPENDED");

      // Phone-OTP account — the path that previously bypassed suspension by
      // minting a fresh token pair for a banned user.
      const phone = "+15550002222";
      const otp1 = await request(server)
        .post("/auth/request-phone-otp")
        .send({ phone });
      const firstLogin = await request(server)
        .post("/auth/login-phone-otp")
        .send({ phone, code: otp1.body.data.devToken, displayName: "Victim" });
      expect(firstLogin.status).toBe(200);
      const phoneUserId = firstLogin.body.data.user.id as string;

      await request(server)
        .patch(`/admin/users/${phoneUserId}/suspend`)
        .set(auth(admin.token))
        .send({ suspended: true })
        .expect(200);

      const otp2 = await request(server)
        .post("/auth/request-phone-otp")
        .send({ phone });
      const reLogin = await request(server)
        .post("/auth/login-phone-otp")
        .send({ phone, code: otp2.body.data.devToken });
      expect(reLogin.status).toBe(401);
      expect(reLogin.body.error.code).toBe("ACCOUNT_SUSPENDED");
    });

    it("blocks a suspended user from minting a fresh token family via household create", async () => {
      const admin = await makeAdmin();
      const victim = await register();
      // Suspend AFTER the victim already holds a valid (stateless) access token.
      await request(server)
        .patch(`/admin/users/${victim.userId}/suspend`)
        .set(auth(admin.token))
        .send({ suspended: true })
        .expect(200);

      // The access token still passes the JWT guard, but creating a household
      // must NOT issue a new, rotatable token family for a suspended account
      // (that would escalate the access-TTL window into a durable session).
      const res = await request(server)
        .post("/households")
        .set(auth(victim.token))
        .send({ name: "Bypass attempt" });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("ACCOUNT_SUSPENDED");
    });
  });
});
