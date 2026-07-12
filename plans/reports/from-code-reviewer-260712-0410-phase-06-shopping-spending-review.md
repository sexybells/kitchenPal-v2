# Phase 06 — Shopping & Spending Backend — Code Review

Reviewer pass over the money layer (expenses/budgets/analytics) and shopping
lists. Static review of working-tree files; build/tests reported green (backend
143, contract 32) and not re-run.

## Scope reviewed

- `apps/backend/src/modules/shopping/**` (schemas, repositories, services,
  controllers, module)
- `apps/backend/src/common/database/base.repository.ts` (optional `session` on
  `create`/`softDelete`)
- `packages/api-contract/src/{shopping,spending}.ts`

## Verdict on the top risk (budget ↔ expense money path)

**No Critical or High correctness defects in the money path.** Verified against
code:

- **Atomicity** — `SpendingService.createExpense` (`spending.service.ts:61-89`)
  runs the expense insert + `budget.incrementSpent` inside one
  `session.withTransaction`; both commit or neither. `deleteExpense`
  (`:126-147`) puts the soft-delete + negative `$inc` in one transaction too.
- **Concurrent expenses** — deduction is an atomic `$inc` (`budget.repository.ts:44-61`),
  no read-modify-write on `spent` anywhere. No lost updates.
- **Refund targets the right budget/cycle** — the expense stores `budgetId`
  (`expense.schema.ts:68`) chosen by `findActiveAt(date)` at log time, and the
  refund charges *that exact* `budgetId` (`spending.service.ts:137-144`), not the
  current cycle. Correct even after the cycle rolls.
- **Double-delete cannot double-refund** — `deleteExpense` reads the expense with
  the scoped, not-deleted `findById` *inside* the transaction; a concurrent
  second delete conflicts on the expense doc write and, on `withTransaction`
  retry, re-reads it as already-deleted → `NotFoundException`, so the refund runs
  at most once.
- **`spent` can't go negative** — each expense charges once and refunds at most
  once of the same `totalAmount`; there is no expense-edit endpoint, so the
  charged amount and refunded amount cannot drift.
- **VND integer / no divide-by-zero** — every money field is
  `z.number().int().min(0).max(1e12)`; `quantity` is `z.number().positive()`
  (`spending.ts:15,33`), so `Math.round(total/quantity)` (`expense-pricing.ts:29`)
  never divides by zero and never produces a float.
- **Scope isolation / IDOR** — all reads/writes go through `ScopedRepository`;
  `:id` and refund paths use scoped filters; all four aggregations
  (`totals`, `totalsByCategory`, `totalsByPeriod`, `priceHistory`) route their
  `$match` through `castMatch` so the `createdBy` ObjectId is cast
  (`expense.repository.ts:82,105,126,155`). The cast fix is applied consistently.

## High

**H1 — Transactions require a MongoDB replica set; a standalone prod Mongo makes
every expense create/delete fail (500).** `withTransaction`
(`spending.service.ts:264-277`) needs a replica set or mongos. The builder only
booted under `MongoMemoryReplSet`; no standalone Mongo was exercised. If the
deployment target is a single-node standalone, `POST /expenses` and
`DELETE /expenses/:id` throw `Transaction numbers are only allowed on a replica
set member or mongos` for every call — passes CI, breaks in prod. **Action:**
confirm the deploy topology is a replica set (even single-node RS) and add it to
deploy prerequisites/health checks. Code is correct; this is an ops gate.

## Medium

**M1 — `createBudget` has no overlap guard; overlapping cycles make the "active"
budget nondeterministic.** `createBudget` (`spending.service.ts:149-163`) always
inserts a new 30-day cycle from `startOfDayUtc(now)` without checking for an
existing active budget. Two budgets can then both cover "now", and
`findActiveAt` uses `findOne` (`budget.repository.ts:23-36`) with no ordering, so
which budget an expense charges, and which `getCurrentBudget`/`summary` reports,
is arbitrary (natural order). Refunds stay correct (stored `budgetId`), so this
is not money-loss, but current-budget reads and new charges become ambiguous.
**Action:** reject creating a budget whose cycle overlaps a live one, or
supersede the prior cycle explicitly; if intentional, add a deterministic
tie-break (e.g. latest `cycleStart`).

**M2 — Merge paths surface a raw 409 with no retry; the automated refill /
add-missing seam can silently fail to add items.** `persistMerge`
(`shopping.service.ts:236-249`) and `addNeededItems` (`:122-144`) call
`updateWithVersion` with the *just-read* `list.version` as the expected version.
Under a concurrent write the loser gets `OPTIMISTIC_LOCK_CONFLICT`. For the
user-driven `generate` that is acceptable (user retries), but `POST needed-items`
is the Phase 4 refill / Phase 5 add-missing hand-off — an automated caller that
does not catch 409 would drop the items. The duplicate-key create race is healed
(`createForPlan:264-274`) but the merge-into-existing race is not. **Action:**
wrap the merge update in a small read-merge-retry loop (re-read on 409, re-merge,
retry) so hand-offs are eventually-consistent instead of best-effort.

**M3 — The `$inc`-in-transaction design serializes on a hot budget document; the
"both succeed concurrently" comment overstates it.** Because the atomic `$inc`
is wrapped in a transaction alongside the insert, two expenses against the same
budget conflict on the budget doc and serialize via `withTransaction` retries —
correct outcome (no lost update) but not lock-free. The comments in
`budget.repository.ts:38-43` and the builder report imply concurrent success.
Personal scope makes contention low today, but for the Phase 7 household scope
(many members, one shared budget) this is a latency/retry-storm risk. **Action:**
adjust the comment to say "serialized via write-conflict retry," and revisit for
household scale (e.g. keep the insert non-transactional and reconcile, or shard
the counter) when Phase 7 lands.

## Low

- **L1 — `findCurrent` loads every list into memory and sorts in JS**
  (`shopping-list.repository.ts:32-41`). Bounded per personal user today;
  becomes unbounded under household scope. Prefer a `.sort({updatedAt:-1}).limit(1)`
  query.
- **L2 — No reconciliation between `sum(items.total)` and `totalAmount`.** A
  client can send items that don't sum to `totalAmount`; the budget charges
  `totalAmount` (authoritative) while price-history uses item lines. Not
  money-loss, but a data-quality gap — consider validating or documenting that
  `totalAmount` is independent of items.
- **L3 — `getSummary.budgetRemaining` uses the *current* budget while the range
  may be an explicit past window** (`spending.service.ts:181-195`). Mixed
  context (range totals vs. current-budget remaining) may read oddly in the UI.
  Intentional per the "budget context is current" framing — just confirm the
  mobile layer treats it that way.
- **L4 — `deleteExpense` ignores the `softDelete` return value**
  (`spending.service.ts:136`). Currently safe because the in-transaction
  `findById` already proved liveness, but a future refactor that moves the read
  out of the transaction would reintroduce a double-refund window. Assert the
  soft-delete actually matched before refunding.
- **L5 — Offset/skip cursor pagination** (`spending.service.ts:110-123`) does a
  deep `.skip()`; fine at current data sizes, O(n) for deep pages later.

## Notes / confirmed non-issues

- Partial-unique index on `mealPlanId` is global (not scope-scoped), but meal
  plans are themselves owner-scoped, so a `mealPlanId` belongs to exactly one
  user — no false cross-user conflict. `generate` also 404s on a non-owned plan
  before touching the index. Safe.
- Version guard on item CRUD is sound: `updateItem`/`deleteItem`/`addItem` pass
  the *client* `expectedVersion` to `updateWithVersion`, so a stale write is a
  clean 409 with no lost update; building `nextItems` from a concurrently-changed
  read still fails the version match.
- The no-op `SpendingEvents` seam fires after commit (`spending.service.ts:96`),
  so a future chat handler failure cannot roll back a logged expense. Safe.
- Deferred-by-design items (household scope, chat integration, mid-cycle
  no-retro-charge) reviewed and are not unsafe as shipped.

## Unresolved questions

1. Is the production Mongo a replica set? (Gates the entire expense/budget path —
   see H1.)
2. Product intent for overlapping budgets in one cycle (M1) — reject, supersede,
   or allow with a deterministic active pick?
3. Should `POST needed-items` (automated seam) be made retry-safe against
   concurrent list edits (M2)?

```
Status: DONE_WITH_CONCERNS
Summary: Money path is correct — 0 Critical, 0 High code defects; atomicity,
atomic $inc, exact-budget refund, no double-refund, VND-integer, and scope
isolation all verified. 1 High ops gate (replica-set requirement), 3 Medium,
5 Low.
Concerns/Blockers: H1 (replica-set deploy prerequisite) will 500 every expense
write on a standalone Mongo; confirm topology before shipping. M1 overlapping
budgets and M2 non-retried merge on the automated refill seam warrant a fix.
```
