# Code Review — Phase 4 Pantry Backend (concurrency + scope safety)

Reviewed working-tree files under `apps/backend/src/modules/pantry/**`, the AiLog
repo, and `packages/api-contract/src/pantry.ts` against the platform base repo,
scope filter, and exception filter. Focus per the brief: cook-loop correctness
under concurrency, scope isolation, scan→confirm, AI degrade honesty, refill seam.

## Overall Assessment

Scope isolation and the AI degrade path are solid and match the builder report.
Every pantry read/write goes through `ScopedRepository` with the request scope; I
found no IDOR path. The degrade path is honest (empty + `degraded:true`, never
fabricated), image bytes and API keys are never logged, and `max_tokens` is
capped. The per-item version-guarded retry in `depleteOne` is correct — a
concurrent consume of the *same* item re-reads and re-applies, so no single-item
lost update.

Two real concurrency/atomicity defects remain: (1) `confirmScan` is a
check-then-act race that double-inserts pantry items on double-submit, and (2)
multi-item `consume`/`cook` is not atomic — a mid-list failure leaves earlier
items depleted with no rollback and no report. Both pass the happy-path e2e (which
never fires concurrent or partial-failure cases) but bite in production.

## Critical Issues

None. No cross-user leak, auth bypass, or unbounded data loss found.

## High Priority

### H1 — `confirmScan` double-inserts items on concurrent/double-submit confirm
`services/pantry-scan.service.ts:178-217`. The flow is: `findById` → check
`status !== "confirmed"` → **create all items** (lines 194-209) → `updateWithVersion`
guarding `scan.version` (211). The version guard protects only the *scan doc*, and
it runs *after* the items are already written. Two concurrent confirms (double-tap,
client retry) both read `version=0`/`status="ready"`, both pass the check, both
create the full item set. The first `updateWithVersion` wins; the second throws 409
— but its items are already persisted and are now **orphaned duplicates** (not even
recorded in `materializedItemIds`, which only holds the winner's set). Result: the
pantry silently contains 2× the confirmed items, and the client sees a confusing
409 for a request that did mutate state.
Sequential replay is correctly blocked by the status check; only the concurrent
path is exposed, and the e2e only tests sequential re-confirm (`pantry.e2e-spec.ts:240`).
Fix: flip the scan status to `confirmed` with a version-guarded update *first*
(claim the scan), then materialize items only if that claim succeeds; or wrap
claim+create in a Mongo transaction. Materializing after an unguarded read is the
core defect.

### H2 — `consume`/`cook` multi-item depletion is not atomic; partial failure corrupts silently
`services/pantry.service.ts:181-224`. Both loop over items calling `depleteOne`,
which commits each item independently. If item N fails — not found, or optimistic
retries exhausted → `ConflictException` — the exception propagates and the request
returns an error, but items 1..N-1 are **already depleted and committed** with no
rollback and no report of what succeeded. The client cannot tell which items were
consumed, and a naive whole-request retry **double-depletes** the earlier items.
This is exactly the "one item failing silently corrupts others" case the brief
calls out. There is no `depleted`/`failed` partitioning in the error path — it's
all-or-nothing in intent but partial in effect.
Fix options: (a) pre-resolve/validate every item id up front and fail before any
write; (b) run the batch in a transaction; or (c) return a per-item result vector
(`succeeded[]`, `failed[]`) instead of throwing, so the caller can reconcile. At
minimum, resolve all ids before the first mutation.

## Medium Priority

### M1 — Body `pantryItemId` isn't validated as an ObjectId → 500 on malformed id
`packages/api-contract/src/pantry.ts:116,165` validate `pantryItemId` as
`z.string().min(1)` (consume) / `.optional()` (cook), while the *path* params use a
strict 24-hex `objectIdSchema`. In `depleteOne`/`cook`, `items.findById(scope, id)`
runs `findOne({ _id: id })`; a non-ObjectId string triggers a Mongoose `CastError`,
which is not an `HttpException`, so `all-exceptions.filter.ts:70-73` maps it to
**500** (redacted in prod) instead of a clean 400/404. Combined with H2, if the bad
id is not first in the list, earlier items are already depleted before the 500.
Fix: validate `pantryItemId` with the same 24-hex regex in the contract.

### M2 — Default `expiry` sort surfaces no-expiry items FIRST, not last
`repositories/pantry-item.repository.ts:29-34`. The default list sort is
`expiry: { expiryDate: 1, name: 1 }` with no expiry filter unless `expiringInDays`
is passed. In MongoDB ascending order, `null`/missing sorts **before** real dates,
so items with no `expiryDate` appear at the top of "soonest-expiring first" — the
opposite of intent. The inline comment ("documents with no expiry sort last … Mongo
orders nulls before dates on ascending") is self-contradictory and the "sort last"
claim is wrong. This directly undermines the Home "expiring soon" wiring (phase
step 5). Fix: exclude/deprioritize null expiry in the expiry sort (e.g. a
`$sort` on a computed `expiryDate ?? far-future`, or filter `expiryDate: {$ne:null}`
for that sort mode).

### M3 — No idempotency on `consume`/`cook`; retries double-deplete
`services/pantry.service.ts:181-224`. There's no idempotency key or dedupe. A
network retry or double-tap re-runs the full depletion; each version-guarded write
succeeds on its own, so quantities drop twice and an assistive item can wrongly
flip to `low`/`out`. This may be an accepted product tradeoff for now, but it's the
double-submit case the brief asks about and isn't guarded anywhere. Consider an
idempotency key on the consume/cook payload if the mobile client can retry.

## Low Priority

- **L1 — quantity/state divergence when a tracked item is consumed with no amount.**
  `services/stock-state.ts:66-74`: for `exact`/`household_unit` items called
  without `amount`, `applyDepletion` steps `stockState` down but leaves `quantity`
  unchanged. A later quantity-based consume re-derives the state from the untouched
  quantity and silently reverses the step-down. Edge case, but state and quantity
  can disagree.
- **L2 — `confirmScan` accepts any non-`confirmed` status and never cross-checks
  items against the scan's detections.** Editable detections are by design, but a
  `pending`/`failed` scan is confirmable and the materialized items are 100%
  client-supplied (the scan's `detections[]` are decorative at confirm time).
  Benign today because `createScan` always writes `status:"ready"`, but the guard
  is weaker than "materializes only confirmed detections" implies.
- **L3 — vision cache key is global, not scope-partitioned.** `ai-vision.service.ts:46`
  keys on `sha256(bytes)` with no user/scope. Not a leak — detections are a pure
  function of image content — but note it if detections ever carry user context.

## Verified Non-Issues (checked, sound)

- Scope isolation: `find`/`findById`/`create`/`updateWithVersion`/`softDelete` all
  route through `ScopedRepository` + `scopeFilterFor`; another user's item returns
  null → 404. No IDOR.
- AI degrade honesty: no-keys and all-providers-fail both return
  `{provider:"none",detections:[],degraded:true}`, logged as failure, not cached.
  OpenAI→Gemini fallback ordering correct in `pantry.module.ts:27-52`. Keys are in
  headers only; only `detectionCount`+`usage` are logged, never image bytes.
- Single-item concurrent consume: `depleteOne` re-reads and re-applies on 409 with
  bounded retries (`pantry.service.ts:232-269`) — no lost update on the same item.
- Cache TTL: `cache-manager@^6` uses milliseconds, so the 10-min TTL is correct.
- Regex inputs (`search`, `findByName`) are escaped (`escapeRegExp`) — no ReDoS/
  injection via name.
- `source`/`confidenceState` are server-set, never client-supplied.

## Recommended Actions

1. H1: claim the scan (version-guarded status flip) before materializing items, or
   use a transaction. Highest-value fix.
2. H2: resolve/validate all ids before any mutation, or make the batch
   transactional / return a per-item result vector.
3. M1: tighten `pantryItemId` to the 24-hex ObjectId regex in the contract.
4. M2: fix the expiry sort so no-expiry items sort last.
5. M3: decide on idempotency for consume/cook with the product owner.

## Unresolved Questions

- Is concurrent/double-submit `confirm` and `consume` a realistic client pattern
  for the mobile app (retry-on-timeout)? That determines whether H1/H2/M3 are
  ship-blockers or fast-follows.
- Should `confirm` cross-validate submitted items against the scan's own
  detections, or is full client control intended (manual-entry parity)?

```
Status: DONE_WITH_CONCERNS
Summary: 0 Critical, 2 High, 3 Medium, 3 Low. Scope isolation and AI degrade are
sound; the two High items are a check-then-act double-insert in confirmScan and
non-atomic multi-item consume/cook partial-failure — both invisible to the
happy-path e2e.
Concerns/Blockers: H1 (confirm double-insert) and H2 (non-atomic consume) are the
concurrency defects the brief prioritized; recommend fixing before relying on the
cook loop in production.
```
