# Phase 04 — Pantry + AI Scan + Cook loop (backend + contracts)

Backend and shared contracts only. Mobile is a later delegation.

## Entities (Mongoose, base + scoped plugins, `createdBy` ownership)

- **PantryItem** (`pantry_items`): name, category, quantity, unit, `stockState`
  (plenty|some|low|out), `trackingMode` (state_only|household_unit|exact),
  `confidenceState` (confirmed|estimated|low), `source` (manual|scan|refill),
  `expiryDate` (indexed). Indexes: category, stockState, expiryDate, plus the
  base `deletedAt`/scope indexes. `version` from the base plugin.
  - `apps/backend/src/modules/pantry/schemas/pantry-item.schema.ts`
- **PantryScan** (`pantry_scans`): imageKey/imageUrl (via the storage adapter),
  `status` (pending|ready|confirmed|failed), `provider`, embedded `detections[]`
  (ScanDetection), `degraded`, `materializedItemIds[]`, `error`.
  - `apps/backend/src/modules/pantry/schemas/pantry-scan.schema.ts`

Repositories extend `ScopedRepository` (all reads/writes scope-filtered):
`pantry-item.repository.ts` (adds `findByName` + paginated/sorted `list`),
`pantry-scan.repository.ts`.

## Endpoints (all `@Scope("personal")`, enveloped, zod-validated)

- `GET /pantry/items` — filter (category, stockState, search, expiringInDays),
  sort (expiry|name|recent), cursor pagination (opaque base64 offset).
- `POST /pantry/items`, `PATCH /pantry/items/:id`, `DELETE /pantry/items/:id`
  (soft-delete).
- `GET /pantry/refill-suggestions` — low/out items, out first (shopping seam).
- `POST /pantry/consume` — deplete listed items.
- `POST /pantry/cook` — cook-this-meal orchestrator (see below).
- `POST /pantry/scans` (multipart image), `GET /pantry/scans/:id`,
  `POST /pantry/scans/:id/confirm`.

All 8 paths verified present in the OpenAPI `/docs` document at boot.

Controllers: `pantry.controller.ts`, `pantry-scans.controller.ts`.
Scope note: routes are personal-scoped for now. The schema + `ScopedRepository`
already support household scope; wiring household pantries waits for the
household module (Phase 7). This is the one intentional deviation.

## AI vision: provider fallback + safe degrade

`ai/ai-vision.service.ts` orchestrates an ordered provider chain built from
config: **OpenAI primary → Gemini fallback** (`pantry.module.ts` factory only
constructs a provider when its key is present). Per attempt it times the call
and writes an `AiLog` entry (provider, operation, latency, success, and a
response summary of detection count + token usage) via the new
`AiLogRepository` (added to `LogsModule`, exported). Providers
(`openai-vision.provider.ts`, `gemini-vision.provider.ts`) use built-in
`fetch` — no new dependency — send the image inline (base64, capped
`max_tokens`/`maxOutputTokens`), and share `detection-parser.ts` to normalize
model JSON into typed detections with a low-confidence flag.

Degrade path: no keys (empty provider array) or every provider throwing returns
`{ provider: "none", detections: [], degraded: true }` — an honest, empty,
clearly-flagged result, logged as a failure. It can never be mistaken for real
detections. Identical images are served from cache (sha256 of bytes) so a
re-open is free. Image bytes and API keys are never logged.

## Cook loop + consume/stock-state + Phase-6 seam

`services/stock-state.ts` (pure, unit-tested): `deriveStockState(qty)` maps a
quantity to the assistive level via documented thresholds (0→out, ≤1→low,
≤3→some, else plenty); `stepStockStateDown` steps state_only items;
`applyDepletion` subtracts for quantity-tracked items and re-derives the level,
or steps state_only items down.

`consume`/`cook` deplete via `depleteOne`, which reads the item then applies the
**atomic, version-guarded** `updateWithVersion`, retrying up to 3× on an
optimistic-lock conflict — so concurrent depletions never lose an update.
Depletion sets `confidenceState: "estimated"` (computed, not user-verified).

`cook` resolves each ingredient by `pantryItemId` or, failing that, by
case-insensitive name within scope; unmatched ingredients are returned (not
depleted). It then returns `refillSuggestions` computed from the resulting
low/out items. **Phase-6 seam:** refill-suggestions/cook only RETURN the list;
nothing writes a shopping list. `RefillSuggestion` carries exactly what the
shopping module will consume (pantryItemId, name, category, unit, quantity,
stockState).

## New api-contract DTOs (`packages/api-contract/src/pantry.ts`)

Enums: stockState, trackingMode, confidenceState, pantryItemSource,
pantryScanStatus. Schemas/types: pantryItemResponse, createPantryItem,
updatePantryItem, pantryItemQuery, consumePantry + consumeResult,
refillSuggestion(+Response), cookMeal + cookResult, pantryDetection,
pantryScanResponse, confirmScan. Exported from `index.ts`; dual-format package
rebuilt. Contract tests: `src/__tests__/pantry-contract.test.ts`.

## Verification (actual output)

- `pnpm --filter @kitchenpal/api-contract build` → success (ESM+CJS+DTS).
- `pnpm --filter @kitchenpal/api-contract test` → 2 files, 12 tests passed.
- `pnpm --filter @kitchenpal/backend build|lint|typecheck` → all clean.
- `pnpm --filter @kitchenpal/backend test` → 14 suites, **84 tests passed**
  (incl. `pantry.e2e-spec.ts`, `ai-vision.service.spec.ts`,
  `stock-state.spec.ts`).
- Root `pnpm build && pnpm lint && pnpm typecheck && pnpm test` → all 6 tasks
  successful; backend 84 tests pass; mobile/admin untouched and green.
- Boot on ephemeral Mongo + OpenAPI scan printed all 8 pantry paths:
  `/pantry/items`, `/pantry/items/{id}`, `/pantry/refill-suggestions`,
  `/pantry/consume`, `/pantry/cook`, `/pantry/scans`, `/pantry/scans/{id}`,
  `/pantry/scans/{id}/confirm`.

e2e coverage: create/list/filter/search; consume flips some→low→out and
depletes quantity; state_only step-down; refill-suggestions ordering; expiry
sort; scan (no keys → degraded → confirm materializes items, source=scan);
re-confirm rejected (409); non-image rejected (400); cook loop
(deplete + unmatched + refill); cross-user scope isolation (404 on other user's
item, empty list). AI unit test covers primary success, fallback on error,
degrade with no providers, degrade when all fail, and cache hit — all with
mocked providers (hermetic, no network).

## Files changed

New: `packages/api-contract/src/pantry.ts` (+ test);
`apps/backend/src/modules/pantry/**` (schemas, repositories, services, ai,
controllers, module + specs); `apps/backend/src/modules/logs/repositories/ai-log.repository.ts`;
`apps/backend/test/pantry.e2e-spec.ts`.
Edited: `api-contract/src/index.ts`; `app.module.ts` (register PantryModule);
`logs.module.ts` (provide/export AiLogRepository); `uploads.module.ts` (export
STORAGE_ADAPTER for reuse); `config/env.schema.ts` + `.env.example` (OPENAI/
GEMINI keys, models, AI_VISION_MAX_TOKENS). No root config or other apps touched.

## Deviations / unresolved

- Pantry is personal-scoped only for now (household scope deferred to Phase 7);
  schema/repo already support it. Ties to open question #2 (personal-first vs
  household-always).
- Quantity→stock-state thresholds (≤1 low, ≤3 some) are deliberate assistive
  heuristics; there is no per-item capacity model. Users can override the level
  explicitly. Revisit if product wants per-item thresholds.
- Provider request/response shapes target current OpenAI chat-completions and
  Gemini generateContent; only exercised with real keys (never in CI). Worth a
  smoke test against real keys before relying on live detection quality.

Status: DONE
Summary: Phase-4 pantry backend + shared contracts implemented — items CRUD,
scan→review→confirm with OpenAI/Gemini vision and safe keyless degrade, and the
cook→deplete→refill loop with atomic version-guarded consume. All build/lint/
typecheck/test gates green workspace-wide (backend 84 tests); 8 pantry routes
live in /docs.
Concerns/Blockers: Household-scoped pantries intentionally deferred to Phase 7
(personal scope only now); refill-suggestions leaves a documented seam for the
Phase-6 shopping module.

---

## Review fixes applied (concurrency + validation hardening)

Addressed the code-review findings in
`from-code-reviewer-260712-0124-phase-04-pantry-backend-review.md`.

**H1 — confirmScan double-insert (fixed).** `services/pantry-scan.service.ts`
now CLAIMS the scan first: a version-guarded status flip `ready → confirmed`
runs BEFORE any item is materialized. Two concurrent confirms both read `ready`,
but only one version-guarded flip wins; the loser gets a 409 and creates
nothing, so items materialize exactly once. Also tightened the confirmable
status to `ready` only (rejects pending/failed, partially covering L2). New e2e
`materializes items exactly once under concurrent confirm` fires two parallel
confirms and asserts statuses `[201, 409]` and item total `2`.

**H2 — non-atomic multi-item consume/cook (fixed).** `services/pantry.service.ts`
now runs consume and cook inside a MongoDB transaction (`connection.startSession`
+ `session.withTransaction`); every read/write threads the session. A mid-batch
failure aborts the whole transaction (all-or-nothing) and a write conflict is
retried by the driver. To support sessions without duplicating the platform
write invariants, `common/database/base.repository.ts` gained an optional
`ClientSession` param on `find`/`findOne`/`findById`/`updateWithVersion` (and the
internal `versionedUpdateWhere`) — additive, backward-compatible; the existing
base-repo spec and all Phase 1-3 tests still pass. consume treats a missing id
as a hard error (whole batch rolls back); cook treats an explicit-but-missing
`pantryItemId` as an error, and a name-only no-match as soft `unmatched`. New
e2e tests: `consume is all-or-nothing` and `cook is all-or-nothing` assert the
matched item is unchanged after the failing request. Transactions need a replica
set, so the pantry e2e now boots `MongoMemoryReplSet` (new `startInMemoryReplSet`
helper); other suites stay on the standalone.

**M1 — pantryItemId validation (fixed).** Added a shared `objectIdSchema`
(24-hex) to `api-contract/src/pantry.ts`; `consumePantry` and `cookMeal`
`pantryItemId`s now use it, and both controllers reuse it for path params
(removing the duplicated inline regex). Malformed ids are a clean 400 instead of
a Mongoose CastError → 500. Covered by a contract test and an e2e
(`rejects a malformed pantryItemId with 400, not 500`).

**M2 — expiry sort backwards (fixed).** `repositories/pantry-item.repository.ts`
`list` now uses an aggregation that computes `_expirySort = expiryDate ?? maxDate`
and sorts on it, so soonest-expiring items come first and no-expiry items come
LAST (the Home "expiring soon" order). Results are hydrated back to documents,
and the `$match` filter is cast (`find(filter).cast(model)`) because aggregation
does not auto-cast the scope filter's string ids. Test updated to include a
no-expiry item and assert order `[Sooner, Later, NoExpiry]`.

**M3 — idempotency (fixed).** Optional `idempotencyKey` on consume/cook
(contract). `runIdempotent` caches the first result under
`pantry:idem:<op>:<userId>:<key>` (10-min TTL) and returns it for replays, so a
retry/double-tap does not deplete twice. New e2e
`dedupes a repeated consume carrying the same idempotency key` asserts 5→4 once.
Note: two *simultaneous* requests with the same key can still both miss the
cache; the transaction keeps each internally consistent, and the common
retry-after-response case is fully deduped. A hard lock is a fast-follow if
strict simultaneous idempotency is required.

**L1 — quantity/state divergence (fixed).** `services/stock-state.ts`: when a
quantity-tracked item is stepped down without an amount, its quantity is set to a
representative value for the new level (`nominalQuantityFor`) so a later
amount-based consume cannot re-derive and reverse the step-down. Unit test added.

**L2 — confirm cross-check (partial, by design).** Confirm still accepts
client-supplied items because the degrade path yields empty detections and the
user must be able to enter items manually (manual-entry parity). Hardened by
restricting confirmable scans to `status === "ready"`. Constraining items to the
scan's detections would break manual entry, so full client control is retained
intentionally.

**L3 — global cache key.** Skipped per the review (not a leak; detections are a
pure function of image bytes).

### Verification (actual)

- `pnpm --filter @kitchenpal/api-contract build` → success; `test` → 14 passed.
- `pnpm --filter @kitchenpal/backend build|lint|typecheck` → all clean;
  `test` → 14 suites, **90 tests passed** (84 preserved + 6 new
  concurrency/atomicity/idempotency/sort/validation).
- Root `pnpm build && pnpm lint && pnpm typecheck && pnpm test` → all 6 tasks
  successful workspace-wide; mobile/admin untouched.

### Files touched in this pass

`packages/api-contract/src/pantry.ts` (objectIdSchema, idempotencyKey) + its
test; `apps/backend/src/common/database/base.repository.ts` (optional session);
`modules/pantry/services/pantry.service.ts` (transactions + idempotency),
`services/pantry-scan.service.ts` (claim-first confirm),
`services/stock-state.ts` (L1) + its spec;
`repositories/pantry-item.repository.ts` (expiry sort + session);
`pantry.controller.ts` / `pantry-scans.controller.ts` (shared objectIdSchema);
`test/in-memory-mongo.ts` (replica-set helper); `test/pantry.e2e-spec.ts` (new
tests, replica set).

Status: DONE
Summary: All review findings addressed — confirmScan claims-then-materializes
(no double-insert), consume/cook are transactional all-or-nothing with optional
idempotency keys, ObjectId ids validated at the edge, expiry sort fixed
(no-expiry last), and quantity/state kept consistent. 90 backend tests pass;
all gates green workspace-wide.
Concerns/Blockers: Simultaneous same-key idempotency isn't hard-locked (rare;
transaction keeps each request consistent) — fast-follow if strict dedupe is
needed. Base repository gained an optional session param (additive, backward-
compatible) to keep the transactional path DRY.
