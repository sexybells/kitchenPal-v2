# Deployment runbook

Deploy targets for KitchenPal: **backend + Redis on Fly.io**, **MongoDB Atlas**
(replica set), **admin as a static site** (nginx image on Fly.io, or any static
host), **mobile via EAS internal** (out of scope here — see
[Mobile hand-off](#mobile-eas-internal-hand-off)).

## Why Fly.io (not Railway)

Both were on the table (see the rebuild plan's open question #1). Fly is used
here because:

- `fly.toml` is config-as-code, reviewable in git (`apps/backend/fly.toml`,
  `apps/admin/fly.toml`), rather than dashboard-configured settings.
- Fine-grained control over health checks and `min_machines_running`, which
  matters for the backend (always-on — Socket.IO/BullMQ should not cold-start)
  vs. the admin static site (fine to scale to zero).
- A generous free egress tier for a media-light API.

Railway is an equally reasonable choice with the same env var contract; if you
switch, replace `apps/backend/fly.toml`/`apps/admin/fly.toml` with a
`railway.json` and swap the deploy steps in `.github/workflows/deploy.yml` for
the Railway CLI/GitHub Action. Nothing else in this runbook changes.

## Architecture

```
                 ┌──────────────────┐
  Browser/App -> │  admin (nginx)   │  static SPA, Fly.io (or any static host)
                 └────────┬─────────┘
                          │ REST (VITE_API_URL, baked at build time)
                          ▼
                 ┌──────────────────┐        ┌───────────────┐
  Mobile (EAS) ->│ backend (NestJS) │ <----> │ Redis         │ rate-limit,
                 │ Fly.io           │        │ (managed)     │ cache, queues,
                 └────────┬─────────┘        └───────────────┘ Socket.IO adapter
                          │ MONGODB_URI (replica set, TLS)
                          ▼
                 ┌──────────────────┐
                 │ MongoDB Atlas    │  replica set — REQUIRED for transactions
                 └──────────────────┘
```

## MongoDB Atlas (replica set — required, not optional)

The expense/consume paths use multi-document transactions (e.g. logging or
deleting an expense atomically adjusts the household budget). MongoDB refuses
every transactional write against a standalone `mongod` with:

```
Transaction numbers are only allowed on a replica set member or mongos
```

Atlas clusters are replica sets by default (even the free M0 tier), so this is
satisfied automatically — just use the Atlas-provided `MONGODB_URI`. Do not
point production at a standalone instance.

Setup:

1. Create an Atlas project + cluster (M10+ recommended for production; M0 is
   fine for staging/demo).
2. Create a database user scoped to the `kitchenpal` database.
3. Network access: allow the Fly.io app's egress IPs, or `0.0.0.0/0` combined
   with a strong password/short-lived credentials if IP allowlisting isn't
   practical for your Fly region (Fly machines don't have static IPs on the
   default network — either use Fly's dedicated IPv4 add-on for allowlisting,
   or rely on the connection string's credentials as the access control).
4. Copy the SRV connection string into `MONGODB_URI`
   (`mongodb+srv://user:pass@cluster.mongodb.net/kitchenpal?retryWrites=true&w=majority`).
5. The env schema (`apps/backend/src/config/env.schema.ts`) rejects a
   localhost `MONGODB_URI` in production — this is a deliberate fail-closed
   guardrail, not a bug.

## Redis

Required in production (rate limiting is per-instance and incoherent without
it; BullMQ queues need it; the Socket.IO Redis adapter needs it for
cross-instance chat/notification delivery). Any managed Redis works — Fly's
Upstash Redis integration (`fly redis create`), Upstash directly, or
Railway/Redis Cloud. Set `REDIS_URL` to the provided connection string (use
`rediss://` for TLS where offered).

The daily meal reminder also runs on Redis: at boot the backend registers a
BullMQ job scheduler (`meal-reminders-tick` on queue `meal-reminders`) that
ticks hourly at :00, and each tick pushes to users whose local time is 16:00
(at most one reminder per user per local date, push only, never email). The
schedule is shared, so several instances still send once. Without Redis the
scheduler logs a warning and no reminders go out; HTTP keeps serving.

## Environment variables

### Backend (`apps/backend`)

Authoritative list: `apps/backend/.env.example`. Required in production
(enforced by `envSchema`'s `superRefine` — the app refuses to boot if these are
missing/invalid):

| Variable | Purpose |
| :-- | :-- |
| `NODE_ENV=production` | Enables every production guardrail below. |
| `MONGODB_URI` | Atlas SRV connection string (replica set, non-localhost). |
| `REDIS_URL` | Rate limiting, cache, BullMQ, Socket.IO cross-instance fanout. |
| `JWT_ACCESS_SECRET` | Signs access tokens. No dev fallback in production. |
| `SOCKET_CORS_ORIGINS` | Comma-separated browser origin allowlist — no wildcard. Must include the admin console's origin (and any web client). |
| `STORAGE_PROVIDER=s3` | `local` is rejected in production (not durable across redeploys, not shared across instances). |
| `S3_BUCKET`, `S3_REGION` | Required when `STORAGE_PROVIDER=s3`. |

Also set (not schema-enforced, but required for real functionality):

| Variable | Purpose |
| :-- | :-- |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Omit only if the compute has an ambient IAM role with bucket access. |
| `UPLOAD_PUBLIC_BASE_URL` | Bucket's public/CDN URL (not `/uploads`) when using S3. |
| `ADMIN_EMAILS`, `ADMIN_BOOTSTRAP_SECRET` | Admin bootstrap — see below. |
| `RESEND_API_KEY`, `EMAIL_FROM` | Transactional email; without a key, tokens are only logged (fine for staging, not production). |
| `OPENAI_API_KEY` / `GEMINI_API_KEY` | Pantry-scan vision + recipe suggestions; both optional — features degrade to manual-entry/heuristics without them, never crash or fabricate. |
| `GOOGLE_SEARCH_API_KEY`, `GOOGLE_SEARCH_CX` | External recipe search; optional, degrades to an empty flagged result. |
| `GOOGLE_CLIENT_IDS`, `APPLE_CLIENT_IDS` | Social sign-in; without them, that path is dev-only and rejected in production. |
| `EXPO_PUSH_ENABLED`, `EXPO_ACCESS_TOKEN` | Push notification fanout. |

Set all of these as Fly secrets (never in `fly.toml`, never committed):

```bash
fly secrets set --app kitchenpal-backend \
  MONGODB_URI='mongodb+srv://...' \
  REDIS_URL='rediss://...' \
  JWT_ACCESS_SECRET="$(openssl rand -hex 32)" \
  SOCKET_CORS_ORIGINS='https://admin.kitchenpal.example' \
  STORAGE_PROVIDER=s3 \
  S3_BUCKET='kitchenpal-prod-uploads' \
  S3_REGION='ap-southeast-1' \
  S3_ACCESS_KEY_ID='...' \
  S3_SECRET_ACCESS_KEY='...' \
  UPLOAD_PUBLIC_BASE_URL='https://cdn.kitchenpal.example' \
  ADMIN_EMAILS='owner@example.com' \
  ADMIN_BOOTSTRAP_SECRET="$(openssl rand -hex 24)"
```

### Admin (`apps/admin`)

Vite bakes `VITE_*` vars into the JS bundle at **build** time — there is no
runtime env var on the deployed static site. `VITE_API_URL` must point at the
backend's public URL and is passed as a Docker build arg
(`--build-arg VITE_API_URL=...`) or as the static host's build-time env var.
See `apps/admin/.env.example`.

## First-deploy steps

1. **Atlas**: create the cluster + database user (above); note the
   `MONGODB_URI`.
2. **Redis**: provision (above); note the `REDIS_URL`.
3. **S3 bucket**: create a bucket (or Cloudflare R2/MinIO-compatible), enable
   public read on the object prefix used, or front it with a CDN; note
   `S3_BUCKET`/`S3_REGION`/credentials and the public base URL.
4. **Backend**: `fly launch --no-deploy --copy-config --name kitchenpal-backend`
   from the repo root, then `fly secrets set ...` (above), then
   `fly deploy --config apps/backend/fly.toml --dockerfile apps/backend/Dockerfile`.
5. **Verify**: `curl https://kitchenpal-backend.fly.dev/health/ready` returns
   `200` with `{"data":{"status":"ok",...}}`. If it returns `503`, Mongo is not
   reachable — check `MONGODB_URI`/Atlas network access before anything else.
6. **Admin bootstrap** (one-time, per environment): sign up a real account
   through the API/mobile app with an email listed in `ADMIN_EMAILS`, then call
   the bootstrap endpoint with `ADMIN_BOOTSTRAP_SECRET` to elevate it to
   `admin` (see `AuthService.bootstrapAdmin` /
   `apps/backend/src/modules/auth/services/auth.service.ts`). Rotate
   `ADMIN_BOOTSTRAP_SECRET` (or remove it from secrets) once the first admin
   exists — it is a standing elevation path as long as it's set.
7. **Admin console**: `fly launch --no-deploy --copy-config --name kitchenpal-admin`,
   then
   `fly deploy --config apps/admin/fly.toml --dockerfile apps/admin/Dockerfile --build-arg VITE_API_URL=https://kitchenpal-backend.fly.dev`.
8. **GitHub Actions**: set repo secrets `FLY_API_TOKEN` (one token, both apps)
   and `ADMIN_VITE_API_URL`; configure the `production` GitHub Environment with
   required reviewers if a manual approval gate is wanted before `deploy.yml`
   runs its deploy jobs.

## CI/CD

- `.github/workflows/ci.yml` — blocking `lint`/`typecheck`/`test`/`build` on
  every push to `main` and every PR. Unchanged by this phase.
- `.github/workflows/deploy.yml` — triggered by a `v*` tag push or manual
  dispatch. Its own `verify` job re-runs the identical blocking gate on the
  commit being deployed; `deploy-backend`/`deploy-admin` both `need: verify`
  and run under the `production` GitHub Environment, so a red build can never
  ship and an environment-level required-reviewer rule (if configured) gates
  the actual deploy.

## Local full-stack dev

`docker-compose.yml` at the repo root runs backend + a single-node Mongo
**replica set** + Redis, so the transactional paths work exactly like
production without needing Atlas locally:

```bash
docker compose up --build
curl http://localhost:3001/health/ready
docker compose down -v   # also drops the mongo-data volume
```

The `mongo-init` service runs `rs.initiate()` once against the `mongo`
service (idempotent — treats "already initialized" as success) before the
backend starts. `apps/backend/.env` (copy from `.env.example`) is loaded if
present; the compose file's `MONGODB_URI`/`REDIS_URL` overrides point at the
in-network `mongo`/`redis` hostnames instead of `localhost`.

Docker was not available in the environment this phase was built in — the
compose file's YAML was validated with a parser, and `docker build`/
`docker compose config` were not run against a real Docker daemon. Before
relying on this for local dev, run:

```bash
docker compose config          # validates the merged config
docker compose up --build      # full local stack
docker build -f apps/backend/Dockerfile -t kitchenpal-backend .
docker build -f apps/admin/Dockerfile --build-arg VITE_API_URL=http://localhost:3001 -t kitchenpal-admin .
```

Expected result: `docker compose config` prints the resolved config with no
errors; both `docker build` commands complete and produce runnable images
(`docker run --rm -p 3001:3001 --env-file apps/backend/.env kitchenpal-backend`
then `curl localhost:3001/health` for the backend; `docker run --rm -p 8080:80
kitchenpal-admin` then load `http://localhost:8080` for the admin console).

## Observability & security — status

Already implemented in earlier phases; confirmed (not re-implemented) here:

- **Structured logs + request-id**: `AppLogger` (pino-backed) +
  `RequestIdMiddleware` attach/propagate `x-request-id` on every request and
  log line (`apps/backend/src/common/logging/`).
- **Helmet**: applied globally in `main.ts` (`app.use(helmet())`).
- **Rate limiting**: global `ThrottlerGuard`, Redis-backed storage when
  `REDIS_URL` is set outside tests (`apps/backend/src/common/throttler/`) —
  coherent across multiple Fly machines.
- **Socket.IO CORS allowlist**: `AuthenticatedIoAdapter` never accepts a
  wildcard; only origins listed in `SOCKET_CORS_ORIGINS` are allowed for
  browser clients (native clients send no `Origin` and are authenticated by
  the JWT handshake instead).
- **Fail-closed provider config**: AI vision/suggestions, external search,
  social sign-in, and now storage all degrade safely (or refuse to boot in
  production) rather than silently misbehaving when unconfigured.
- **AiLog cost tracking**: every AI provider call (vision, suggestions,
  auto-fill) is recorded in `AiLog` with `promptTokens`/`completionTokens`/
  `costUsd` when the provider reports usage
  (`apps/backend/src/modules/logs/schemas/ai-log.schema.ts`); the admin
  ai-costs report sums whatever is present. Nothing to configure — it's
  populated automatically as calls happen.

Extended in this phase:

- **`GET /health`**: plain liveness — always `200`, reports Mongo connection
  state in the body. Used for "is the process up" checks.
- **`GET /health/ready`**: readiness — now returns `503` (not `200`) when
  Mongo is disconnected, so Fly's health check actually detects and routes
  around/restarts an instance that can't serve requests. This is what
  `fly.toml`'s `[[http_service.checks]]` points at.

## Socket.IO: sticky sessions / cross-instance delivery

With more than one backend machine running, a single chat/notification
session's polling requests can land on different machines between requests.
Rather than rely on platform-level sticky routing (not guaranteed on Fly for
HTTP long-polling across machines), `AuthenticatedIoAdapter` wires the
`@socket.io/redis-adapter` whenever `NODE_ENV=production` and `REDIS_URL` is
set (`apps/backend/src/common/socket/authenticated-io.adapter.ts`) — it fans
every emitted event to all machines via Redis pub/sub, so a client is
correctly reached regardless of which machine its connection is on. No extra
config is needed beyond setting `REDIS_URL`, which is already required.
`min_machines_running = 1` in `fly.toml` keeps at least one instance warm so
this fanout has somewhere to deliver to even at zero traffic.

## Mobile (EAS internal) hand-off

Out of scope for this phase — handled by the mobile workstream in parallel.
Documented here only as a hand-off boundary:

- Distribution: Expo/EAS **internal** distribution (per the rebuild plan's
  open question #3) — not a public store submission in this cycle.
- The mobile app's API base URL points at the deployed backend
  (`https://kitchenpal-backend.fly.dev` or a custom domain) via its own Expo
  env config — not covered here.
- Push notifications: `EXPO_PUSH_ENABLED=true` + `EXPO_ACCESS_TOKEN` on the
  backend once the mobile app's push flow is verified end-to-end against a
  real EAS build; until then it safely no-ops (in-app notification records
  still get created).
- No backend contract changes are expected for EAS internal distribution
  itself — it is purely a mobile build/signing concern.
