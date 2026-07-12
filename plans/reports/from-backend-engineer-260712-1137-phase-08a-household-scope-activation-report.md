# Phase 08a — Household-Scope Activation (Backend) — Implementation Report

Date: 2026-07-12 · Scope touched: `apps/backend/**` only (no `packages/api-contract` change needed — scoped entities already carry `scope`/`householdId`).

## Summary

Activated household data-sharing for the feature modules deferred in Phase 7.
When a caller acts with a verified active household membership, pantry, recipes,
meal-plans, shopping lists, and expenses/budgets now read/write in HOUSEHOLD
scope so members share one bucket. With no active household (or a revoked
membership) they transparently fall back to PERSONAL scope — personal mode stays
first-class. The expense→chat-card seam now fires from the live HTTP route.
Scoped unique indexes were re-keyed so household sharing does not create
per-member duplicates or collapse the personal/household buckets.

## How scope resolution now works

- New decorator `@HouseholdScope()` (`common/scope/scope.decorator.ts`) marks a
  route as *household-preferred* via its own metadata key. It is distinct from the
  stored `DataScope`, so no contract/enum change was needed.
- `ScopeGuard` (`common/scope/scope.guard.ts`) reads that flag and resolves the
  `ScopeContext` from the VERIFIED principal: `household` when the caller has an
  `activeHouseholdId` AND `MembershipVerifier.isActiveMember` confirms current
  active membership; otherwise `personal`. This reuses the exact Phase-7
  membership seam (no duplicated check) and never trusts a client-supplied
  scope/householdId.
- The fall-back to personal is fail-SAFE, not a 403. A stale token whose
  membership was revoked drops to the user's own personal data rather than being
  denied — proven by a unit test. The strict `@Scope("household")` routes
  (household/chat) keep their fail-closed 403 behaviour unchanged.
- Controllers were already written to consume `@CurrentScope()` and pass it to
  services, so activation was a decorator swap with ZERO service/controller-body
  changes for the shared paths.

Unit coverage: `scope.guard.spec.ts` gained a `household-preferred` describe
block (verified-member → household; no household → personal; revoked → personal
not 403; unauthenticated → reject). The reflector fake now dispatches by metadata
key.

## Per-module changes

- **pantry** (`pantry.controller.ts`, `pantry-scans.controller.ts`): all routes
  `@Scope("personal")` → `@HouseholdScope()`. Items and photo-scans (and the
  items a scan materializes) are shared in a household.
- **recipes** (`recipes.controller.ts`): recipe CRUD, community/publish,
  favorites, ratings/comments, suggestions, external search, URL import, and
  pantry-match → `@HouseholdScope()`. **Dietary PREFERENCES stay
  `@Scope("personal")`** — allergens/diet are per-user safety data that must never
  be blended across members. `RecipeSelectionService` now reads preferences via
  `toPersonalScope(userId)` (new helper in `scope-context.ts`), so AI
  suggestions/auto-fill respect the *caller's own* dietary profile even when the
  candidate recipes and pantry are household-scoped.
- **meal-plans** (`meal-plans.controller.ts`): all routes → `@HouseholdScope()`.
- **shopping** (`shopping.controller.ts`): all routes → `@HouseholdScope()`.
- **spending** (`spending.controller.ts`): all routes → `@HouseholdScope()`.

## Personal / household bucket semantics

`buildScopeFilter` already partitions cleanly: personal reads/writes filter on
`{ scope:"personal", createdBy:userId }`, household on
`{ scope:"household", householdId }`. `ScopedRepository.create` stamps
`scope`/`householdId` from the resolved context (never caller input). Therefore:

- Data created in a household is household-scoped and readable/writable by every
  active member (verified e2e: member B sees/edits what A created).
- Personal data (created with no active household) is a SEPARATE bucket, invisible
  in household mode and vice-versa (verified e2e using a user's pre-join personal
  token vs. their refreshed household token).
- Non-members can never read/write a household's data — their household-preferred
  scope resolves to their own personal bucket, and household docs 404 by id
  (verified e2e across pantry/recipes/meal-plans/expenses).
- Optimistic-lock/version and soft-delete are unchanged — they already operate
  within whatever scoped filter the repository builds.

Note on issued tokens: `activeHouseholdId` is set on household create/accept but
the pre-existing access token predates it; a token refresh re-reads the user and
mints one carrying `activeHouseholdId`. Tests refresh after joining; the mobile
client already refreshes, so no code change was required.

## Index fixes (re-keyed for household scope)

Each unique index was re-examined. Those that broke under household scope were
split into two scoped partial indexes (personal keyed by creator, household keyed
by household), which also keeps a user's personal row and their household's row of
the same key as independent buckets:

- **meal_plans**: was `{createdBy, weekStart}` unique. Split → personal
  `{createdBy, weekStart}` (scope:personal) + household `{householdId, weekStart}`
  (scope:household). Now ONE plan per household per week — any member's create for
  that week converges on the shared plan (service returns it; index blocks the
  race). Fixes the prior gap where two members could each insert a plan for the
  same week.
- **recipe_favorites**: was `{recipeId, createdBy}` unique. Split → personal
  `{recipeId, createdBy}` + household `{recipeId, householdId}`. Household shares
  one favorites marker per recipe. Also fixes a real bug: without the scope in the
  partial filter, a user's personal favorite and their household favorite of the
  same recipe would have collided.
- **recipe_comments**: same split (`{recipeId, createdBy}` personal +
  `{recipeId, householdId}` household). One shared review per recipe per
  household; same personal/household collision fixed.

Verified-correct, no change needed:

- **shopping_lists** `{mealPlanId}` unique (partial on real ids): a `mealPlanId`
  is a unique reference to one plan, and a plan lives in exactly one bucket, so
  the global key is already correct under household scope. Comment clarified.
- **budgets**: no unique index — cycle-overlap is a range check enforced in
  `SpendingService.createBudget` via `budgets.findOverlapping(scope, …)`, which is
  scope-filtered, so "one active budget" is correctly per-household. (A partial
  unique index cannot express range overlap; the pre-existing same-instant
  double-create race is unchanged and out of scope here.)

## Expense → chat card (live route)

`SpendingService.createExpense` runs in the resolved scope; for a household member
it is now `household` scope, so `ChatSpendingEvents.expenseLogged` (bound over the
`SpendingEvents` no-op in `ShoppingModule`) posts the `expense` card and, when over
budget, the `budget_alert` card + member notification fan-out — all after the
expense/budget transaction commits. New e2e drives this through the real
`POST /budgets` + `POST /expenses` HTTP routes (not the seam directly) and asserts
both chat cards appear and the other member is notified.

## Tests (hermetic; replica-set Mongo)

New `test/household-scope.e2e-spec.ts` (single-node replica set for the
transactional expense path), 8 cases:
share pantry / recipes / meal-plan-per-week convergence / shopping list /
expenses+budget; personal↔household bucket isolation for one user; non-member
isolation across every module; live-route expense card + budget alert +
notification.

### Actual output

- `pnpm --filter @kitchenpal/backend build | lint | typecheck` → all pass (lint
  clean, no `any`).
- `pnpm --filter @kitchenpal/backend test` → **26 suites, 175 tests passed**
  (163 prior + 4 guard household-preferred unit tests + 8 new e2e).
- Root `pnpm build && pnpm lint && pnpm typecheck && pnpm test` → all turbo tasks
  green (backend 175; api-contract + mobile untouched/cached). api-contract not
  modified, so its build/test were not re-run.

## Deviations

- Added `@HouseholdScope()` decorator + `toPersonalScope()` helper (both in
  `common/scope`). No new dependencies. No contract change.
- Recipe dietary PREFERENCES intentionally remain personal-scoped (see rationale
  above) rather than becoming household-shared; the rest of the recipes module is
  household-shared.

## Unresolved questions / follow-ups

1. **Favorites/ratings on unpublished household recipes**: because favorites and
   ratings are now household-scoped, a member CAN favorite/rate a shared
   unpublished household recipe (readable in household scope). Ratings become one
   shared review per household per recipe (household "speaks with one voice");
   public-recipe rating counts are therefore per-household, not per-user. If
   per-user reviews within a household are desired later, key comments by
   `{recipeId, householdId, createdBy}` and filter `findOwnByRecipe` by createdBy.
   Flagged for product confirmation; current behaviour is internally consistent.
2. **Switching households / active-household selection**: there is still no
   endpoint to change `activeHouseholdId` between multiple households; it is set on
   create/accept and cleared on leave. Out of scope here but needed for multi-
   household users.
3. Pre-existing cross-suite flakiness: on a full in-band run one household invite
   test intermittently saw a register return 401 (throttler/timing across e2e
   suites); it passes deterministically in isolation and on re-run. Not caused by
   this change; worth isolating throttle state between e2e suites later.

Status: DONE
Summary: Household-scope activation is complete — pantry, recipes, meal-plans,
shopping, and spending share data among verified household members (personal stays
a first-class separate bucket), scoped unique indexes are re-keyed, and the live
expense route posts the chat card + budget alert. Backend green at 175 tests;
workspace-wide build/lint/typecheck/test all pass.
Concerns/Blockers: Favorites/ratings are now household-shared (one review per
household) — internally consistent but a product decision worth confirming (see
follow-up 1).
