import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  adminCommunityReportResponseSchema,
  communityCommentResponseSchema,
  communityLikeResponseSchema,
  communityPostResponseSchema,
  communityUserProfileSchema,
} from "@kitchenpal/api-contract";
import type { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { startInMemoryMongo } from "./in-memory-mongo";

const ADMIN_EMAIL = "community-admin@kitchenpal.test";
const ADMIN_SECRET = "test-bootstrap-secret";

interface TestUser {
  token: string;
  userId: string;
}

describe("Community feed (e2e)", () => {
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
        email: email ?? `community-${Math.random().toString(36).slice(2)}@example.com`,
        password: "supersecret",
        displayName: "Community User",
      });
    expect(res.status).toBe(201);
    return {
      token: res.body.data.tokens.accessToken as string,
      userId: res.body.data.user.id as string,
    };
  }

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

  async function createPost(
    token: string,
    body: Record<string, unknown>,
  ): Promise<ReturnType<typeof communityPostResponseSchema.parse>> {
    const res = await request(server)
      .post("/community/posts")
      .set(auth(token))
      .send(body);
    expect(res.status).toBe(201);
    return communityPostResponseSchema.parse(res.body.data);
  }

  it("requires authentication", async () => {
    const res = await request(server).get("/community/posts");
    expect(res.status).toBe(401);
  });

  it("rejects a post with neither caption nor image", async () => {
    const user = await register();
    const res = await request(server)
      .post("/community/posts")
      .set(auth(user.token))
      .send({ caption: "   ", images: [] });
    expect(res.status).toBe(400);
  });

  it("creates a post and surfaces likedByMe/isOwner per caller", async () => {
    const author = await register();
    const viewer = await register();
    const post = await createPost(author.token, { caption: "Hello community" });
    expect(post.isOwner).toBe(true);
    expect(post.likedByMe).toBe(false);

    const seen = await request(server)
      .get(`/community/posts/${post.id}`)
      .set(auth(viewer.token));
    expect(seen.status).toBe(200);
    const viewed = communityPostResponseSchema.parse(seen.body.data);
    expect(viewed.isOwner).toBe(false);
    expect(viewed.authorName).toBe("Community User");
  });

  it("toggles a like idempotently and keeps the counter correct", async () => {
    const author = await register();
    const liker = await register();
    const post = await createPost(author.token, { caption: "Like me" });

    const first = await request(server)
      .post(`/community/posts/${post.id}/like`)
      .set(auth(liker.token));
    const firstState = communityLikeResponseSchema.parse(first.body.data);
    expect(firstState.likedByMe).toBe(true);
    expect(firstState.likeCount).toBe(1);

    // Second like is a no-op — the count must not climb to 2.
    const second = await request(server)
      .post(`/community/posts/${post.id}/like`)
      .set(auth(liker.token));
    expect(communityLikeResponseSchema.parse(second.body.data).likeCount).toBe(1);

    const removed = await request(server)
      .delete(`/community/posts/${post.id}/like`)
      .set(auth(liker.token));
    const removedState = communityLikeResponseSchema.parse(removed.body.data);
    expect(removedState.likedByMe).toBe(false);
    expect(removedState.likeCount).toBe(0);
  });

  it("adds and deletes comments, tracking the post counter", async () => {
    const author = await register();
    const commenter = await register();
    const post = await createPost(author.token, { caption: "Talk to me" });

    const added = await request(server)
      .post(`/community/posts/${post.id}/comments`)
      .set(auth(commenter.token))
      .send({ text: "First!" });
    expect(added.status).toBe(201);
    const comment = communityCommentResponseSchema.parse(added.body.data);

    const afterAdd = await request(server)
      .get(`/community/posts/${post.id}`)
      .set(auth(author.token));
    expect(afterAdd.body.data.commentCount).toBe(1);

    // A different user cannot delete someone else's comment.
    const forbidden = await request(server)
      .delete(`/community/comments/${comment.id}`)
      .set(auth(author.token));
    expect(forbidden.status).toBe(403);

    const deleted = await request(server)
      .delete(`/community/comments/${comment.id}`)
      .set(auth(commenter.token));
    expect(deleted.status).toBe(200);

    const afterDelete = await request(server)
      .get(`/community/posts/${post.id}`)
      .set(auth(author.token));
    expect(afterDelete.body.data.commentCount).toBe(0);
  });

  it("hides blocked authors from the feed but not from their profile", async () => {
    const viewer = await register();
    const blocked = await register();
    const post = await createPost(blocked.token, { caption: "From a blocked user" });

    // Visible before blocking.
    const before = await request(server)
      .get("/community/posts")
      .set(auth(viewer.token));
    expect(
      before.body.data.some(
        (p: { id: string }) => p.id === post.id,
      ),
    ).toBe(true);

    const block = await request(server)
      .post(`/community/users/${blocked.userId}/block`)
      .set(auth(viewer.token));
    expect(block.status).toBe(200);

    const after = await request(server)
      .get("/community/posts")
      .set(auth(viewer.token));
    expect(
      after.body.data.some((p: { id: string }) => p.id === post.id),
    ).toBe(false);

    // The author's own profile listing still shows the post.
    const profilePosts = await request(server)
      .get(`/community/users/${blocked.userId}/posts`)
      .set(auth(viewer.token));
    expect(
      profilePosts.body.data.some((p: { id: string }) => p.id === post.id),
    ).toBe(true);

    const profile = await request(server)
      .get(`/community/users/${blocked.userId}`)
      .set(auth(viewer.token));
    const parsed = communityUserProfileSchema.parse(profile.body.data);
    expect(parsed.blockedByMe).toBe(true);
    expect(parsed.isSelf).toBe(false);
  });

  it("rejects blocking yourself", async () => {
    const user = await register();
    const res = await request(server)
      .post(`/community/users/${user.userId}/block`)
      .set(auth(user.token));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("CANNOT_BLOCK_SELF");
  });

  it("lets an admin see a report and remove the offending post", async () => {
    const admin = await makeAdmin();
    const author = await register();
    const reporter = await register();
    const post = await createPost(author.token, { caption: "Reported content" });

    const report = await request(server)
      .post(`/community/posts/${post.id}/report`)
      .set(auth(reporter.token))
      .send({ reason: "spam", detail: "obvious spam" });
    expect(report.status).toBe(200);

    const reports = await request(server)
      .get("/admin/community/reports?status=open")
      .set(auth(admin.token));
    expect(reports.status).toBe(200);
    const row = reports.body.data.find(
      (r: { targetId: string }) => r.targetId === post.id,
    );
    expect(row).toBeDefined();
    adminCommunityReportResponseSchema.parse(row);
    expect(row.targetPreview).toBe("Reported content");

    const remove = await request(server)
      .post(`/admin/community/posts/${post.id}/remove`)
      .set(auth(admin.token));
    expect(remove.status).toBe(200);

    // The post is now soft-deleted: gone from the feed and unreadable.
    const gone = await request(server)
      .get(`/community/posts/${post.id}`)
      .set(auth(author.token));
    expect(gone.status).toBe(404);

    // Its open report was marked reviewed, so it drops off the open queue.
    const openAfter = await request(server)
      .get("/admin/community/reports?status=open")
      .set(auth(admin.token));
    expect(
      openAfter.body.data.some(
        (r: { targetId: string }) => r.targetId === post.id,
      ),
    ).toBe(false);
  });

  it("forbids non-admins from the moderation routes", async () => {
    const user = await register();
    const res = await request(server)
      .get("/admin/community/reports")
      .set(auth(user.token));
    expect(res.status).toBe(403);
  });
});
