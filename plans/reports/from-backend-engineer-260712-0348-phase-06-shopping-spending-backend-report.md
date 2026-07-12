# Phase 06 — Shopping & Spending (Backend + Contracts) — Report

Scope delivered: backend + shared contracts only. Mobile untouched.

## Entities

- **ShoppingList** (`shopping_lists`, scoped, `createdBy` owned): `mealPlanId?`,
  `items[]{ id, name, quantity, unit, category, bought, sourceRecipeId? }`, base
  `version`. Partial-unique index on `mealPlanId` (live docs only) → at most one
  list per plan; ad-hoc lists (`mealPlanId: null`) are exempt.
- **Expense** (`expenses`, scoped): `totalAmount`, `currency: "VND"`, `category`,
  `note`, `date`, `shoppingListId?`, `budgetId?` (which budget it charged),
  `items[]{ name, normalizedName, quantity, unitPrice, total }`.
- **Budget** (`budgets`, scoped): `amount`, `spent`, `currency: "VND"`,
  `cycleStart`, `cycleEnd` (30-day), base `version`.

## Endpoints (all `@Scope("personal")`, enveloped, zod-validated)

Shopping (`/shopping`): `POST generate`, `POST needed-items` (refill /
add-missing hand-off), `GET current`, `GET :id`, `POST :id/items`,
`PATCH :id/items/:itemId` (edit + `bought` toggle), `DELETE :id/items/:itemId`
(`expectedVersion` query).

Spending: `POST/GET expenses`, `DELETE expenses/:id`, `POST budgets`,
`GET budgets/current`, `GET spending/summary`, `GET spending/stats`,
`GET spending/price-history`.

## generate-from-plan algorithm

1. Load the plan (scope-guarded; 404 if not owned). Collect distinct slot
   `recipeId`s.
2. Fetch those recipes via `RecipeRepository.findReadableByIds` and the pantry via
   `PantryItemRepository.find`.
3. For each recipe run the existing `matchIngredients(recipe.ingredients, stock)`
   (Phase 5 seam) and keep `needed[]`, attaching that recipe's id as
   `sourceRecipeId`.
4. `dedupeNeededItems`: collapse by normalized `name + unit`; sum quantities only
   when both are numeric in the same unit; first `sourceRecipeId`/`category` win.
5. Merge into the plan's live list (`mergeNeededIntoItems`): existing lines are
   preserved with their `bought` state; only genuinely-new `name+unit` lines are
   appended with a fresh uuid. → **idempotent regenerate, no silent duplication**.
   A concurrent create loses the unique-index race and heals by merging into the
   winner.

Pure helpers `shopping-item-merge.ts` and `expense-pricing.ts` are unit-tested.

## Budget atomicity + VND choice

- **VND = integer đồng** (no minor unit, no decimals). Every money field is
  `z.number().int().min(0)`; `unitPrice = Math.round(total / quantity)`. No floats,
  so no rounding drift. Documented in `spending.ts`.
- Logging an expense runs a **transaction** (base-repo `session` path) spanning the
  expense insert + budget update, so the two can never drift. The budget deduction
  is an **atomic `$inc` on `spent`** (via `BudgetRepository.incrementSpent`), NOT a
  version-guarded write — two concurrent expenses both `$inc` and both succeed
  (e2e: 6×10 000 → 60 000, no lost updates). A version guard would falsely 409 one
  writer, so `version` guards only budget `amount`/cycle edits.
- Delete refunds the exact `budgetId` the expense recorded, in a transaction with
  the soft-delete (negative `$inc`). e2e verifies spent returns to 0.
- Expense with no active budget still logs (personal mode first-class).

## Chat/budget-alert hook seam

`SpendingEvents` (injectable, exported from `ShoppingModule`) with
`expenseLogged({ scope, expense, budget, overBudget })`. Default is a deliberate
**no-op**; the Phase 7 chat module rebinds this provider to post the chat card +
budget alert. Fired **after** the transaction commits, so a future handler failure
can never roll back a logged expense.

## Analytics aggregations (`ExpenseRepository`)

- `summary`: `totals` + `totalsByCategory` over the range + active-budget context
  (`amount`, `remaining`).
- `stats`: `totalsByPeriod` bucketed by `day`/`month` via `$dateToString` (UTC) +
  category totals.
- `price-history`: `$unwind items` → group by `normalizedName`, `points` pushed
  most-recent-first (`$sort date:-1`), with `latestPrice/minPrice/maxPrice`; outer
  list ordered by latest observation. **Documented order: newest → oldest.**
- Range default: active budget cycle, else last 30 days; explicit `from`/`to` win
  (`to` exclusive).
- Aggregation `$match` filters are cast (`this.model.find(f).cast(model)`) because
  aggregation does not auto-cast the scope filter's `createdBy` ObjectId (caught by
  e2e — this was a real bug fixed).

## New contracts (`packages/api-contract`)

`shopping.ts` (shopping list + item + generate/needed-items/add/update/delete
schemas) and `spending.ts` (currency/money, expense, budget, summary, stats,
price-history, queries). Exported from `index.ts`; dual ESM+CJS build. Contract
unit tests added for both.

## Shared-infra change

`ScopedRepository.create` and `softDelete` gained an optional `ClientSession`
param (backward compatible; base-repo spec still green) so expense insert /
soft-delete can join a transaction. `RecipesModule` now exports
`MealPlanRepository` + `RecipeRepository` for the shopping generate path.

## Verification (actual)

- `@kitchenpal/api-contract`: build ✓, test **32 passed**.
- `@kitchenpal/backend`: build ✓, lint ✓, typecheck ✓, test **143 passed / 22
  suites** (incl. new `shopping.e2e` 7, `spending.e2e` 8, `shopping-item-merge`,
  `expense-pricing`). Phases 1–5 suites still green.
- Root: `pnpm build` ✓ (4/4), `pnpm lint` ✓ (6/6), `pnpm typecheck` ✓ (6/6),
  `pnpm test` ✓ (6/6). Mobile untouched.
- e2e covers: generate (dedupe + pantry-excluded + sourceRecipeId), idempotent
  regenerate, ad-hoc refill hand-off, bought-toggle stale 409, concurrent stale
  toggle (one 200 / one 409), versioned add+delete, cross-user isolation; expense
  unitPrice, atomic budget deduct + refund, concurrent expenses (no lost update),
  no-budget logging, summary/stats correctness, price-history newest-first
  min/max/latest, cross-user isolation.

## Boot / docs note

App boots under the e2e `MongoMemoryReplSet` (replica set required for the
transactional expense↔budget path). No standalone real Mongo was run; Swagger
`/docs` auto-registers both controllers (`@ApiTags shopping` / `spending`) from
`AppModule` — relied on e2e boot rather than a live server.

## Deviations

- Spending endpoints live on a prefix-less `SpendingController` (`expenses`,
  `budgets`, `spending/*`) to match the phase's route names in one module.
- Added `source`-agnostic merge by `name+unit` instead of a stored `source` flag
  (KISS); `sourceRecipeId` still distinguishes recipe-origin lines.

## Unresolved questions

- Budget `spent` starts at 0 and only accrues from expenses logged *after* the
  budget is created (expenses are matched to a budget by date at log time). If a
  budget is created mid-cycle after prior expenses, those are not retro-charged.
  Flag for product confirmation.
- Household scope is schema/repository-ready but all routes are `@Scope("personal")`
  until the Phase 7 household module lands (mirrors pantry/recipes).

## Review fixes applied (code-reviewer pass 260712-0410)

Money path was reviewed CORRECT (atomicity, atomic `$inc`, exact-cycle refund, no
double-refund, VND-integer, scope isolation, aggregation casts). Applied fixes:

- **H1 (ops doc, no logic change)** — `.env.example` `MONGODB_URI` now states a
  replica set is REQUIRED (Atlas or self-managed RS; single-node RS ok) and that a
  standalone mongod 500s every expense write. Mirrored in a doc comment on
  `SpendingService.inTransaction`.
- **M1 — overlapping budget cycles** — `createBudget` now rejects with 409
  (`CONFLICT`) when the new cycle overlaps a live one, via
  `BudgetRepository.findOverlapping(start,end)` (`cycleStart < end && cycleEnd >
  start`). Test added: `rejects a second budget that overlaps the active cycle`.
- **M2 — automated refill/add-missing seam no longer drops items on 409** — the
  merge-into-existing path is now a bounded read-merge-retry (`mergeConverge`,
  `MAX_MERGE_ATTEMPTS = 5`, retries only on `OPTIMISTIC_LOCK_CONFLICT`). Covers
  `generate` (existing list), `addNeededItems`, and the duplicate-key heal in
  `createForPlan`. User-driven item CRUD stays version-guarded with the client's
  `expectedVersion` (unchanged). Test added: `does not drop items when needed-item
  hand-offs run concurrently` (base + 5 concurrent adds → 6 items, none lost).
- **L1** — `ShoppingListRepository.findCurrent` now uses
  `findOne(...).sort({updatedAt:-1,_id:-1})` instead of loading all lists into
  memory.
- **L3** — `getSummary` resolves the budget for `range.from` (the summarized
  window) instead of `now`, so `budgetRemaining` is consistent with `from`/`to`.
- **L4** — `deleteExpense` now checks the `softDelete` return value and 404s on a
  no-op, guarding against a future refund-without-delete window.
- **M3 (comment only, deferred fix)** — corrected the `incrementSpent` comment to
  say concurrent same-budget expenses "serialize on this document via
  write-conflict retries" (not "both succeed lock-free"). Counter-sharding /
  non-transactional reconcile deferred to Phase 7 household scale.

Deferred per reviewer (noted, not changed): **M3** hot-budget-doc retry-storm at
household scale, **L2** `sum(items.total)` vs `totalAmount` reconciliation (totalAmount
is authoritative for budget; items feed price-history), **L5** deep-skip pagination.

Re-verification (actual): api-contract build ✓ + 32 tests; backend
build/lint/typecheck ✓ + **145 tests / 22 suites** (was 143, +M1 +M2); root
`pnpm build` ✓ (4/4), `lint` ✓ (6/6), `typecheck` ✓ (6/6), `test` ✓ (6/6). Mobile
untouched.

## Answers to reviewer's open questions

1. Production Mongo replica set: documented as a hard requirement in `.env.example`
   + code comment (deploy target is Atlas = RS, so prod is fine). Ops gate, not code.
2. Overlapping budgets: resolved as **reject** (409) per reviewer's preference.
3. `POST needed-items` retry-safety: **implemented** (M2).

Status: DONE
Summary: Shopping (generate-from-plan + retry-safe automated merge + versioned
item CRUD) and spending (expenses/budgets with atomic VND deduction/refund +
overlap-guarded budgets + summary/stats/price-history) backend and contracts
implemented with the no-op chat/budget-alert seam; all review fixes (H1 doc, M1,
M2, L1, L3, L4, M3-comment) applied. All workspace gates green (145 backend tests).
Concerns/Blockers: none blocking; deferred M3/L2/L5 noted; replica-set deploy is a
documented ops prerequisite.
