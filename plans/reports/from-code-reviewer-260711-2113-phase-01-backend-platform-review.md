# Phase 1 — Backend Core Platform — Code Review

Date: 2026-07-11 · Reviewer: code-reviewer · Scope: `apps/backend/**` (staged, uncommitted)
Verdict: DONE_WITH_CONCERNS. Solid spine; no currently-reachable exploit (no scoped entities/auth yet), but the central scoping and env primitives do not yet meet the "always safe by default" bar the phase spec sets.

Severity counts: Critical 0 · High 3 · Medium 3 · Low 3

---

## High

### H1 — Scope filter is opt-in, not always-injected → silent cross-scope read/write
`common/database/base.repository.ts:28-65,86-148`, `common/database/scope-filter.ts`

`scope?: ScopeContext` is an **optional** arg on every read (`find/findOne/findById/count`) and every write (`updateWithVersion`, `softDelete`). When omitted, `buildFilter` sets `scopeFragment = {}` and the query runs with **only** `deletedAt: null` — i.e. across all users/households/system docs. The phase spec (line 12 / review priority 1) requires scope filters to be "ALWAYS injected on reads/writes and cannot be bypassed." They are bypassable by omission, and the omission is silent (no type error, no runtime error).

Concrete failure: a future feature repo calls `this.find({ status: "active" })` (forgetting the scope arg) → returns every household's rows. Same for `updateWithVersion(id, v, patch)` / `softDelete(id)` with a client-supplied `id` and no scope → an authenticated user mutates/deletes another household's document by id. This becomes a Critical cross-tenant defect the moment auth (Phase 2) lands and a single call site forgets the arg.

Not currently reachable (only `health` exists; it has no `@Scope`), so ranked High as a foundational-contract gap rather than a live bug.

Fix: make scope non-bypassable for scoped entities. Options: (a) a `ScopedRepository` subclass whose read/write methods take a **required** `ScopeContext`; unscoped collections (AiLog/AdminAuditLog) keep the plain `BaseRepository`. (b) Or require the ctor to declare whether the model is scoped and throw if a scoped model is queried without a context. Keep `deletedAt` injection as-is (that one is correctly unconditional).

### H2 — env schema has no production guardrails; insecure/local fallbacks boot silently
`config/env.schema.ts:12-14,25-26`, `common/throttler/throttler.module.ts:25-28`, `common/cache/cache.module.ts:16-20`

- `REDIS_URL` is fully optional with no `NODE_ENV==="production"` check. In prod with `REDIS_URL` unset, throttler `storage` is `undefined` → **per-instance in-memory rate limiting**: behind N instances the effective global limit is N× and resets on restart, so the documented rate-limit protection is largely ineffective/bypassable. Cache silently degrades to per-instance in-memory (incoherent invalidation).
- `MONGODB_URI` defaults to `mongodb://127.0.0.1:27017/kitchenpal`. In prod with the var unset/mistyped, the app boots "successfully" against a local/empty DB instead of failing fast.

Concrete failure: a prod deploy missing `REDIS_URL` passes startup validation, serves traffic, and quietly loses shared rate limiting + cache coherence. No log warns.

Fix: add a `superRefine`/refine: when `NODE_ENV==="production"`, require `REDIS_URL` (and require `MONGODB_URI` to be explicitly set — drop the localhost default in prod, or at least warn). This is the same class of gap the builder flagged as Q3 for BullMQ (see M3).

### H3 — `updateWithVersion` silently discards every update operator except `$set`
`common/database/base.repository.ts:86-108,151-159`

The write is built as `{ $set: {...update.$set, ...stripOperators(update), updatedBy}, $inc: {version:1} }`. `stripOperators` keeps only **non-`$` top-level keys**. Any Mongo update operator a caller passes — `$inc`, `$push`, `$pull`, `$addToSet`, `$unset`, `$setOnInsert` — is silently dropped from the executed update. The JSDoc says "Applies `update`…", so callers will reasonably expect operators to work.

Concrete failure: a feature calls `updateWithVersion(id, v, { $push: { members: uid }, $inc: { count: 1 } })`. The version bumps and `updatedBy` is set (so it looks like it worked and the 409 contract passes), but `members`/`count` are never modified. Silent data-integrity bug in the platform's one central write primitive.

Fix: forward the caller's operators through (merge `$inc` with the version bump, pass `$push`/`$unset`/etc. straight into the update doc) instead of collapsing everything into `$set`; or explicitly reject non-`$set` operators so misuse is loud, not silent.

---

## Medium

### M1 — HttpException-derived 5xx leaks its message to clients in production
`common/http/all-exceptions.filter.ts:70-125`

Non-HttpException 500s are correctly redacted in prod (`buildEnvelope`, line 82-86). But `fromHttpException` returns `payload.message`/`exception.message` verbatim regardless of `NODE_ENV`. Any code that does `throw new InternalServerErrorException(...)` / `ServiceUnavailableException(...)` with internal detail (e.g. a DB DSN, upstream URL, driver text) returns that string to the client in production.

Fix: in `fromHttpException`, when `status >= 500` and `NODE_ENV==="production"`, replace `message` with the generic string (and drop `details`); still log the original server-side.

### M2 — `create()` does not stamp scope from context and takes a caller-supplied actor
`common/database/base.repository.ts:67-79`

Reads centralize scoping, but `create` only stamps `createdBy/updatedBy/deletedAt/version` and takes `actor?: string` from the caller — it does not accept a `ScopeContext` to stamp `scope`/`householdId` consistently. So the write side of the isolation invariant is unmanaged: a feature can create a `household` doc without a `householdId`, or set `scope`/`createdBy` inconsistently with how reads will filter, producing documents that are invisible to their owner or (worse) mis-scoped. `scope` being schema-`required` catches the fully-missing case loudly, but not the mismatched-value case.

Fix: add a scoped create path that derives `scope`, `householdId`, and `createdBy` from the `ScopeContext`/`AuthUser` rather than trusting caller-passed values — mirrors how `ScopeGuard` derives identity from `request.user`.

### M3 — BullMQ defaults to `127.0.0.1:6379` when `REDIS_URL` unset
`common/queue/queue.module.ts:15-20`

Unlike cache/throttler (which gate on `NODE_ENV!=="test"`), the queue connection has no prod guard: `REDIS_URL` unset → `{ host:"127.0.0.1", port:6379 }`. Harmless today (no queues registered, so no connection opens — confirmed below), but once a feature registers a queue in a later phase, a prod env missing `REDIS_URL` will connect to localhost. This is the builder's own open question Q3. Folds into the H2 fix (require `REDIS_URL` in production).

---

## Low

### L1 — `--forceExit` is defensive, not masking a live leak (verified)
`package.json:14`

Ran the full suite with `--detectOpenHandles` and no `--forceExit`: all 3 suites / 10 tests pass and the process **exits on its own in ~2.2s with zero open handles reported**. So today `--forceExit` hides nothing (no Bull/ioredis handle leaks because `REDIS_URL` is unset and no queues register → no ioredis instance is created). The real risk is future: once queues/Redis land, `--forceExit` will silently swallow a genuine leaked-handle regression. Recommend dropping `--forceExit` and relying on `app.close()`/`mongo.stop()` teardown so a real leak surfaces in CI. Not a production concern (runtime has `enableShutdownHooks()` + `app.close()`).

### L2 — request-id middleware trusts inbound `x-request-id` verbatim
`common/logging/request-id.middleware.ts:17-22`

Any client-supplied `x-request-id` is accepted unmodified into logs and the response envelope (any length/charset). Enables log-correlation spoofing and minor log-injection (newlines) into the pino line. Low because logs are JSON-encoded and this is internal correlation only. Consider bounding length and restricting to a safe charset (or ignoring inbound and always generating).

### L3 — requestId fallback can desync from the response header
`common/http/response.interceptor.ts:29`, `common/http/all-exceptions.filter.ts:47`

Interceptor falls back to `""` and the filter to `randomUUID()` when `request.requestId` is absent. Since `RequestIdMiddleware` is `forRoutes("*")` this only occurs for failures before the middleware runs — in which case `meta.requestId` (empty string, or a fresh UUID) won't match the `x-request-id` response header (unset). Edge-only; harmless given current wiring. Could set `req.requestId` earlier or have the filter also set the header.

---

## Verified correct (checked, no action)

- Optimistic lock is atomic: single `findOneAndUpdate` with `version` in the filter + `$inc: {version:1}` — no read-then-write race, no lost-update window. Mismatch reliably yields 409 `OPTIMISTIC_LOCK_CONFLICT`; the post-fail `exists` probe cleanly distinguishes 409 vs 404 (a concurrent delete degrading to 404 is acceptable). (`base.repository.ts:86-130`, spec covers all three paths.)
- `deletedAt: null` is injected unconditionally on every read and on the scope/`exists` probes — soft-deleted docs cannot leak via these helpers.
- Identity in `ScopeGuard` derives from `request.user.id`/`roles`/`activeHouseholdId`, never client body. `PlaceholderAuthGuard` is correctly non-global; `ScopeGuard` (global) no-ops without `@Scope` and 401s a scoped route with no `request.user` — public `health` stays open.
- Success/error envelopes match `@kitchenpal/api-contract` (`metaSchema`, `errorEnvelopeSchema`, `pageInfoSchema`); `meta.requestId` equals `x-request-id` on the normal path (e2e asserts it). Scope enum matches `dataScopeSchema` (`personal|household|system`).
- Throttler + Scope guards both registered global; 429 returns `RATE_LIMIT_EXCEEDED` in the error envelope (e2e verified). Validation errors return `VALIDATION_ERROR` with `details` (e2e verified). Secrets/config are not logged; 5xx stack traces log server-side only.

---

## Unresolved questions

1. H1 fix shape: introduce a distinct `ScopedRepository` (scope required) vs. keeping one repo with an enforced flag? Decision affects every feature module built on this spine — worth settling before Phase 2 consumers land.
2. Builder Q2: confirm the admin role literal (`"admin"`) that `ScopeGuard` keys `system` scope on, once the auth phase defines the role vocabulary (`scope.guard.ts:53`).
3. Builder Q1: confirm per-entity scoping convention (`scope` + `householdId` via `scopedSchemaPlugin`, personal ownership via `createdBy`) matches intended feature-schema design.
4. H3: is `updateWithVersion` intended to support arbitrary Mongo operators, or is `$set`-only the intended contract? If the latter, make it reject other operators loudly rather than dropping them.
