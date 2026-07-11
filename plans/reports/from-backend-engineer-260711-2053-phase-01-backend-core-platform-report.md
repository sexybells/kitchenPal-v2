# Phase 1 — Backend Core Platform — Completion Report

Date: 2026-07-11 · Package: `@kitchenpal/backend` (NestJS 11) · Owner path: `apps/backend/**`

## Status

All acceptance criteria green. App boots against real (in-memory) Mongo; `/health`, `/docs`, envelope, throttle, and validation verified.

## What was built

Config
- `src/config/env.schema.ts` — zod env contract, `loadConfig()` (dotenv + validate, fail-fast), `APP_CONFIG` token. Canonical `PORT=3001`.
- `src/config/config.module.ts` — global provider for validated config.
- `apps/backend/.env.example` — authoritative env list (Mongo, Redis, PORT, NODE_ENV, log/throttle/swagger, JWT placeholders for auth phase).

Logging / request-id
- `common/logging/request-context.ts` — AsyncLocalStorage store for `requestId`.
- `common/logging/request-id.middleware.ts` — reuse/generate `x-request-id`, echo on response, run request in ALS.
- `common/logging/app-logger.service.ts` — pino-backed `LoggerService`, auto-attaches `requestId`, silent in test.
- `common/logging/logging.module.ts` — global.

HTTP envelope
- `common/http/response.interceptor.ts` — wraps results as `{data, meta:{requestId}}`; `PageResult` → `{data, meta:{requestId, page}}`.
- `common/http/all-exceptions.filter.ts` — `{error:{code,message,details}, meta:{requestId}}`; preserves handler codes, derives code from status otherwise, folds class-validator arrays into details, hides 5xx message in prod + logs it.
- `common/http/page-result.ts` — `PageResult` + `paginate()` producing `pageInfoSchema`-shaped `page`.
- `common/http/error-codes.ts` — stable codes incl. `OPTIMISTIC_LOCK_CONFLICT`, `VALIDATION_ERROR`, `RATE_LIMIT_EXCEEDED`.
- `common/validation/zod-validation.pipe.ts` — validates against shared zod schemas, throws `VALIDATION_ERROR` with `error.flatten()` details.

Database + scoping
- `common/database/base.schema.ts` — `baseSchemaPlugin` (createdBy/updatedBy, deletedAt soft-delete, version, timestamps) + `scopedSchemaPlugin` (scope, householdId).
- `common/database/scope-filter.ts` — `buildScopeFilter`/`scopeFilterFor` for personal/household/system.
- `common/database/base.repository.ts` — read helpers auto-inject soft-delete + optional scope filter; `updateWithVersion` centralizes optimistic lock (version match → `$inc`, mismatch → 409, absent → 404); `softDelete`, `create`.
- `common/database/database.module.ts` — `MongooseModule.forRootAsync` from config.
- `common/scope/*` — `@Scope()` + `CurrentScope`, `@CurrentUser()`, `ScopeGuard` (resolves + attaches `request.scopeContext`, no-op without `@Scope`), `PlaceholderAuthGuard` (clearly-commented, non-global, replaced in auth phase), `auth-user.ts`, `scope-context.ts`.
- `src/types/express.d.ts` — augments Request with `requestId`, `user`, `scopeContext`.

Infra modules
- `common/cache/cache.module.ts` — global cache-manager; Redis (`@keyv/redis`) when `REDIS_URL` set outside test, else in-memory.
- `common/throttler/throttler.module.ts` — global `ThrottlerGuard`; Redis storage when configured, in-memory otherwise (hermetic tests).
- `common/queue/queue.module.ts` — global BullMQ `forRootAsync` (no queues yet).

Modules + bootstrap
- `modules/health/*` — `GET /health`, `/health/ready` (Mongo readyState), `/health/echo` (zod-validated pagination query, demonstrates validation/envelope).
- `modules/logs/*` — `AiLog` + `AdminAuditLog` schema-only stubs (base plugin applied), registered via `forFeature`.
- `app.module.ts` — wires modules + global interceptor/filter/scope-guard providers + request-id middleware.
- `main.ts` — helmet, useLogger(AppLogger), shutdown hooks, Swagger at `/docs`, listen on PORT.

## Key decisions

- Logger: **pino** wrapped as Nest `LoggerService` (KISS, structured, no pino-http HTTP-log noise). `requestId` via AsyncLocalStorage.
- Redis in tests: **degrade gracefully** — throttler + cache fall back to in-memory when `NODE_ENV=test`; no `ioredis-mock` needed. BullMQ registers but opens no connection (no queues). Tests need zero external services.
- 409 contract: error `code = "OPTIMISTIC_LOCK_CONFLICT"`, HTTP 409, `details:{id, expectedVersion}`. Client should re-read, rebase on current `version`, retry. Documented in `error-codes.ts`.
- `request.user`: **not populated yet**. `ScopeGuard`/`PlaceholderAuthGuard` read an already-set `request.user`; the auth phase adds the JWT middleware that populates it. Auth guard is intentionally NOT global so public routes (health) stay open.
- Validation: **zod pipe** consuming shared `@kitchenpal/api-contract` schemas (single source of truth), not class-validator — consistency with the contract package. Filter still handles class-validator array messages for future modules.
- eslint: extends shared base, **`consistent-type-imports` off** (protects Nest DI metadata). Config renamed to `eslint.config.mjs` (backend package is CommonJS).
- tsconfig: overrides base to `module: CommonJS`, `moduleResolution: Node`, decorators + `emitDecoratorMetadata`, target ES2022. Consumes `@kitchenpal/api-contract` via its CJS build.

## Verification (actual output)

`pnpm --filter @kitchenpal/backend build` → nest build, exit 0.
`pnpm --filter @kitchenpal/backend lint` → eslint, 0 errors 0 warnings.
`pnpm --filter @kitchenpal/backend typecheck` → tsc --noEmit, 0 errors.
`pnpm --filter @kitchenpal/backend test` → `Test Suites: 3 passed`, `Tests: 10 passed` (e2e: health 200 envelope, 429 rate-limit, 400 validation shape; unit: soft-delete exclusion, version→409, missing→404, scope-filter x3).

Whole workspace:
- `pnpm build` → 3 tasks successful.
- `pnpm lint` → 4 tasks successful.
- `pnpm typecheck` → 4 tasks successful.
- `pnpm test` → 4 tasks successful (backend 10, api-contract 4, design-tokens 4).

Live boot (in-memory Mongo, real listen on 3011):
```
/health              -> 200 | x-request-id=88c4b203-... | {"data":{"status":"ok","uptimeSeconds":2,"mongo":"connected"},"meta":{"requestId":"88c4b203-..."}}
/docs                -> 200
/health/echo?limit=0 -> 400 | {"error":{"code":"VALIDATION_ERROR","message":"Validation failed","details":{"formErrors":[],"fieldErrors":{"limit":[...]}}},"meta":{"requestId":"..."}}
```

## Deviations / notes

- Jest runs with `--forceExit`. The BullMQ root connection (guarded to not connect in test, but ioredis background retry to localhost is possible) can leave a handle; tests are green and hermetic, forceExit is the safety net. Not a leak in app runtime (shutdown hooks + app.close() tear modules down).
- `/docs` responses carry no `x-request-id` — Swagger UI is served by its own express handler outside the Nest middleware/interceptor pipeline. Expected.
- Added a `/health/echo` diagnostic endpoint purely to exercise the zod pipe + envelope end-to-end (real behavior: validates and reflects the normalized query; no fabricated domain data).
- No root config changed. Only `apps/backend/**` created; `.env.example` added there. `@kitchenpal/api-contract` was rebuilt (its own dist) so the CJS entry exists for the backend to require — no source change to that package.

## Unresolved questions

1. Scope model fields: base repo's scope filter assumes feature docs carry `scope` + `householdId` (via `scopedSchemaPlugin`) and personal ownership via `createdBy`. Confirm this matches the intended per-entity scoping when feature schemas land.
2. `system` scope write-restriction currently keys on `user.roles` containing `"admin"`; confirm the admin role name once the auth phase defines the role vocabulary.
3. BullMQ default connection host when `REDIS_URL` unset is `127.0.0.1:6379`; confirm queues will always run with `REDIS_URL` set in real envs (they will fail loudly otherwise once a queue registers).

Status: DONE
Summary: NestJS 11 core platform delivered — config/env(zod), Mongo + base schema/soft-delete/optimistic-lock repo, response envelope + exception filter + pagination, Redis-backed throttler/cache with hermetic in-memory fallback, BullMQ, Swagger /docs, scoping primitives, request-id logging, AiLog/AdminAuditLog stubs. All builds/lint/typecheck/tests green workspace-wide; app boots and serves /health + /docs.
Concerns/Blockers: Minor — jest uses --forceExit for the guarded Bull/Redis handle; scope-field and admin-role conventions to confirm with the auth phase.

---

## Review fixes applied (round 2)

Addressed the code review (`from-code-reviewer-260711-2113-phase-01-backend-platform-review.md`). All under `apps/backend/**`.

HIGH
- H1 + M2 — scope safe-by-default (`common/database/base.repository.ts`, `.spec.ts`): split into `AbstractRepository` (shared soft-delete + optimistic-lock mechanics) → `BaseRepository` (unscoped: audit logs / global data, no scope concept) and `ScopedRepository<T extends ScopedDocumentFields>` whose every read/write/softDelete takes a REQUIRED `ScopeContext` — scope filter is always injected, impossible to omit (no optional arg). `ScopedRepository.create(scope, data)` stamps `scope`, `householdId` (from context, `null` unless household), and `createdBy=updatedBy=scope.userId`; caller-supplied scope/owner fields cannot override. Mismatched-scope writes degrade to a clean 404 (filter excludes the row), never touching another owner's doc.
- H2 — production env guardrails (`config/env.schema.ts`, `env.schema.spec.ts`): added `.superRefine` — when `NODE_ENV==="production"`, `REDIS_URL` is required and a localhost/127.0.0.1/::1 `MONGODB_URI` (including the dev default) is rejected, so a prod deploy can't silently fall back to per-instance in-memory rate limiting/cache or boot the wrong DB. Dev/test keep the fallbacks.
- H2/M3 — BullMQ prod guard (`common/queue/queue.module.ts`): uses validated `REDIS_URL` when present; the localhost fallback is now reachable only in dev/test (prod requires `REDIS_URL` via env validation) and logs a warning when used.
- H3 — `updateWithVersion` operator forwarding (`base.repository.ts`): replaced the `$set`-only collapse with `buildVersionedUpdate` — forwards every caller operator (`$inc`/`$push`/`$pull`/`$unset`/`$addToSet`/…), merges the version `$inc` and `updatedBy` `$set`, and still folds plain field maps into `$set`. Locked by a test asserting `$inc`+`$push` persist alongside the version bump.

MEDIUM
- M1 — 5xx redaction (`common/http/all-exceptions.filter.ts`): `fromHttpException` now returns a generic message + stable code (no `details`) for `status>=500` in production, while 4xx client messages are preserved; full exception still logged server-side. Locked by a filter unit spec.

LOW (all addressed — trivial)
- L1: dropped `--forceExit` from the test script; suite exits on its own (verified, no leaked handles).
- L2 (`request-id.middleware.ts`): inbound `x-request-id` is accepted only if it matches `^[A-Za-z0-9._-]{1,128}$`, else a fresh id is generated — prevents log injection / unbounded correlation strings.
- L3 (`all-exceptions.filter.ts`): filter sets the `x-request-id` response header when it isn't already set, so `meta.requestId` and the header stay consistent even for pre-middleware failures.

Tests added/updated to lock invariants: scoped read/write/delete cross-scope isolation (returns nothing / 404, owner doc untouched) + create-stamping; env prod-validation (missing REDIS_URL, localhost/unset MONGODB_URI fail; real infra passes); operator-forwarding persistence; 5xx-in-prod generic message (+ 4xx preserved, dev not redacted). Suite: 5 files / 25 tests.

Verification (actual):
- `pnpm --filter @kitchenpal/backend typecheck` → 0 errors. `lint` → 0 errors/0 warnings. `build` → nest build exit 0. `test` → `Test Suites: 5 passed`, `Tests: 25 passed`, process self-exits ~2.1s.
- Workspace: `pnpm build` 3/3, `pnpm lint` 4/4, `pnpm typecheck` 4/4, `pnpm test` 4/4 (backend 25, api-contract 4, design-tokens 4) — all successful.

Notes:
- Reviewer open Q on H1 shape resolved in favor of a distinct `ScopedRepository` (scope required) vs. an enforced flag — feature modules pick `BaseRepository` (unscoped) or `ScopedRepository` (scoped) explicitly.
- `ScopeContext.userId`/`householdId` are ObjectId hex strings (the base schema casts `createdBy`/`householdId` to ObjectId); the auth phase will populate them from the verified principal. Q2 (admin role literal) and Q3 (per-entity scope convention) still to confirm with the auth/feature phases.

Status: DONE
Summary: All 3 High, 3 Medium, and 3 Low review findings fixed under `apps/backend/**`; scope is now required-by-default via `ScopedRepository`, prod env guardrails + BullMQ/redaction hardened, update-operator forwarding fixed; new invariant tests added; full workspace build/lint/typecheck/test green.
Concerns/Blockers: None blocking — confirm admin role literal and per-entity scope convention when the auth/feature phases land.
