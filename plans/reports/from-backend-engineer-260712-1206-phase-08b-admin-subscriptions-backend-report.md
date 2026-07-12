# Phase 8b — Subscriptions + Admin + Reports + Settings (backend + contracts)

Backend + API contracts only. Admin WEB app deferred to a later delegation.

## Entities / collections added
- `subscription_plans` (SubscriptionPlan: name, tier free|pro, priceVnd, features[], active)
- `user_subscriptions` (UserSubscription: userId, planId, status active|canceled|expired, source admin|system, startAt, endAt)
- `system_settings` (SystemSetting: key, enabled, config — non-secret only)
- `uploads` (Upload: key, url, kind, contentType, sizeBytes, ownerUserId) — written on avatar upload so admins can audit uploads
- User schema: added `suspendedAt` (admin suspend)
- AiLog schema: added optional `promptTokens`/`completionTokens`/`costUsd` (cost report)
- AdminAuditLog: `targetId` changed ObjectId→String (targets vary: user id, plan id, setting key)

## Endpoints
Public subscriptions (`SubscriptionsController`):
- `GET /subscriptions/plans`, `GET /subscriptions/me`, `POST /subscriptions/me/activate` (INERT → `{activated:false,status:"contact_required"}`), `POST /subscriptions/me/cancel` (real opt-out).

Admin (all `@Roles('admin')`, unscoped cross-tenant reads):
- Users: `GET /admin/users` (list/search/paginate), `GET /admin/users/:id`, `PATCH .../roles`, `PATCH .../suspend`
- Content: `GET /admin/households[/:id]`; recipes `GET|POST /admin/recipes`, `GET|PATCH|DELETE /admin/recipes/:id`, `PATCH .../publish`; scans `GET /admin/scans[/:id]`; `GET /admin/uploads`
- Logs: `GET /admin/logs/{ai,external-search,audit}`
- Reports: `GET /admin/reports/{usage,growth,ai-trend,ai-costs}`
- Settings: `GET /admin/settings/integrations`, `PUT /admin/settings/integrations/:key`
- Subscriptions: `GET|POST /admin/subscriptions/plans`, `PATCH /admin/subscriptions/plans/:id`, `POST /admin/subscriptions/assign`, `POST /admin/subscriptions/users/:userId/cancel`
- Dev tools: `POST /admin/dev/{seed-plans,seed-recipes,reset}` (non-prod only)

## Admin auth + audit design
- `RolesGuard` promoted to a GLOBAL `APP_GUARD` (runs after `JwtAuthGuard`, before `ScopeGuard`). Every `@Roles('admin')` route is enforced regardless of per-controller `@UseGuards`; non-admin → 403. Verified by e2e (`GET /admin/*` with a normal token = 403).
- Cross-tenant reads use unscoped `BaseRepository`-derived admin repos (`AdminReadRepository.paginate`), so admins see all tenants while soft-delete exclusion still applies.
- `AdminAuditService.record(actorId, {action, targetType, targetId, before, after, metadata})` writes an immutable `admin_audit_logs` row on EVERY admin mutation (role/suspend, recipe CRUD/publish, plan CRUD, subscription assign/cancel, setting update). before/after are redacted summaries (field names / non-secret values only). Explicit service-level calls (not an interceptor) so before/after is captured consistently.

## Report aggregations
Mongo `$dateToString` UTC buckets; every pipeline bounded to a time window (default lookback: day 30d / week 90d / month 365d). Bucket formats: day `%Y-%m-%d`, week `%G-W%V`, month `%Y-%m`.
- usage: live counts (users, households, recipes, scans, aiCalls, activeSubscriptions)
- growth: newUsers + newHouseholds per bucket (two `countCreatedByBucket` aggregations merged by date)
- ai-trend: calls + failures per bucket
- ai-costs: prompt/completion tokens + USD summed per provider (from AiLog usage fields; sums 0 until writers populate them)

## Settings secret-safety
- `SystemSetting.config` stores ONLY non-secret values. On write, keys matching `/(secret|password|token|api[-_]?key|credential|private[-_]?key)/i` are STRIPPED before persistence and logged; stripped key NAMES (not values) recorded in the audit row. Secrets stay in env; no settings endpoint reads env or returns a secret. e2e asserts a submitted `apiKey` is absent from the response AND the full list payload.

## Dev-tool prod guard
`DevToolsService` reads `NODE_ENV` at construction; every action calls `assertNonProduction()` → `ForbiddenException` when production. `reset` hard-deletes only dev-owned data (plans, user subscriptions, system recipes, settings) — never accounts. Covered by a unit spec (`dev-tools.service.spec.ts`) constructing the service with a production config; all three actions reject.

## Admin session hardening (#7)
Added `ADMIN_ACCESS_TOKEN_TTL_SECONDS` (default 600s) + `ADMIN_ACCESS_TOKEN_TTL_SECONDS` constant. `TokenService.accessTtlFor()` signs a SHORTER access token (and reports matching `expiresIn`) when the subject holds the `admin` role; regular users unchanged (token spec still asserts 900s). Suspending a user also `revokeAllForUser` so suspension bites within the short access-token window rather than the 90-day refresh window; suspended users are rejected at login.

## M1 fix — join takes effect immediately
`POST /households` and `POST /invites/:code/accept` now set `activeHouseholdId` (create forces it) AND return a FRESH token pair whose access token already carries the new `activeHouseholdId`. Contract: `householdJoinResultSchema = householdResponseSchema.extend({ tokens })` — a flat extension, so existing tests parsing `householdResponseSchema` (which strips unknown keys) keep passing with zero churn. e2e decodes the returned JWT and asserts `activeHouseholdId === householdId` for both create and accept.

## New contracts (packages/api-contract/src)
- `subscription.ts`, `admin.ts` (exported from index)
- `household.ts`: added `householdJoinResultSchema`
- Contract test: `__tests__/admin-subscription-contract.test.ts`

## Verification (actual)
- `pnpm --filter @kitchenpal/api-contract build` → success; `test` → 7 files, **48 passed**.
- `pnpm --filter @kitchenpal/backend build|lint|typecheck` → all clean; `test` → **28 suites, 185 passed** (was 175; +10: admin e2e 9 + dev-tools guard 1). Runs on ephemeral in-memory Mongo.
- Root `pnpm build && pnpm lint && pnpm typecheck && pnpm test` → **6/6 tasks successful each** (mobile untouched; mobile build still exports its 27 routes).
- Swagger: routes are registered NestJS controllers, so they appear in `/docs` when `SWAGGER_ENABLED=true`. Swagger is off in the hermetic e2e; route registration + guarding is proven by the e2e boot instead of a live `/docs` fetch (no real Mongo available here).

## Notes / deviations
- Double model registration in `AdminModule.forFeature` is intentional and safe: `@nestjs/mongoose@11` reuses an already-compiled model (`connection.models[name] || connection.model(...)`, verified in source).
- Self-`cancel` is a REAL opt-out (a downgrade, not a purchase); only self-`activate` is inert — keeps monetization admin-controlled without blocking a user from leaving Pro.
- `Upload` audit collection added because avatars previously left no queryable record; the storage adapter still holds the bytes.
- No git commit made (controller commits). Deps: none added.

## Unresolved questions
- ai-costs will report zeros until AI provider call sites populate the new `promptTokens/completionTokens/costUsd` on AiLog (out of this phase's scope — schema + aggregation are ready).
- Suspension is enforced at login + refresh-revocation, not per-request (keeps the JWT guard stateless). If instant per-request revocation is required, a suspended-user check in the guard would be needed — flagged for product decision.
- `reset-dev-data` scope is deliberately narrow (dev-owned collections). Confirm whether a fuller reset (pantry/shopping/households) is wanted for QA.

## Review fixes applied (code-reviewer 260712-1250)

- **H1 — nested secret strip (FIXED).** `sanitizeConfig` now recurses through nested objects AND arrays (`admin-settings.service.ts` `sanitizeValue`), stripping any key matching the secret pattern at ANY depth and reporting its dotted path. `{config:{s3:{secretAccessKey:...}}}` and array-nested `apiKey` are now dropped before persistence and never echoed. Documented the residual limitation (key-name inspection only; a secret placed in a non-secret-named VALUE still passes — secrets belong in env). New e2e: "strips secret-looking keys nested at any depth".
- **M1 — dev tools now audited (FIXED).** `seedPlans`/`seedRecipes`/`resetDevData` write `dev.seed-plans` / `dev.seed-recipes` / `dev.reset` audit rows; `resetDevData` now takes `actorId` (controller passes `@CurrentUser`). The audit trail is NOT in the reset's wipe set, so the `dev.reset` row survives with the acting admin. New e2e asserts both rows + actor.
- **M2 — audit write is best-effort (FIXED).** `AdminAuditService.record` is called after the (non-transactional) mutation commits, so it now wraps the insert in try/catch: a failed audit insert is logged loudly at ERROR (with stack) via `AppLogger` but never re-thrown, so a committed mutation is never turned into a 500. All admin paths are non-transactional/best-effort (documented); none currently share a session with the audit write.
- **L1 — removed** redundant `@UseGuards(RolesGuard)` + import on `users.controller.ts` (guard is global now).
- **L2 — RolesGuard** now short-circuits `context.getType() !== "http"` like its sibling auth/scope guards (future-proofing WS handlers).
- **L3 — deferred** per task (suspended user's live access token valid to TTL; short admin TTL kept). Product decision.

### Re-verification (actual)
- `pnpm --filter @kitchenpal/api-contract build` → success (no contract change this round).
- `pnpm --filter @kitchenpal/backend build|lint|typecheck` → clean; `test` → **28 suites, 186 passed** (185 + 1 nested-secret e2e; dev-tools e2e now also asserts audit rows).
- Root `pnpm build && lint && typecheck && test` → **6/6 tasks each** green (mobile untouched).

Status: DONE
Summary: Applied all review fixes — recursive nested-secret stripping (H1), audited dev tools (M1), best-effort non-500 audit writes (M2), removed redundant guard (L1), RolesGuard WS short-circuit (L2). All contract + backend + workspace gates green (48 + 186 tests).
Concerns/Blockers: L3 (per-request suspension enforcement) deferred by design; secret-strip inspects key names only (secrets in values still pass — documented, secrets belong in env).
