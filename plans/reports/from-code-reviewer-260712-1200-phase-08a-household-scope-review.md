# Phase 08a — Household-Scope Activation — Code Review

Date: 2026-07-12 · Reviewer: code-reviewer · Scope: working-tree changes only (no code modified).

## Verdict

Cross-tenant isolation is **sound**. Every converted feature route resolves its scope
through the membership-verified guard; no route trusts `activeHouseholdId` from the token
alone, and no client-supplied scope/householdId is honored anywhere. I could not construct
a cross-tenant read/write path. The findings below are correctness/operational, not leaks.

Severity counts: Critical 0 · High 0 · Medium 1 · Low 3.

## What I verified (priority order)

### 1. Cross-tenant isolation — PASS
- All feature routes carry `@HouseholdScope()` (pantry, pantry-scans, meal-plans,
  recipes, shopping, spending) except the two dietary-preference routes, which are
  correctly `@Scope("personal")`. No feature route was left un-decorated (grepped every
  controller; every handler injects `@CurrentScope()`).
- `ScopeGuard.resolveHouseholdPreferred` (`scope.guard.ts:126`) grants `household` scope
  **only** when `MembershipVerifier.isActiveMember(user.id, user.activeHouseholdId)` returns
  true. The householdId used in the filter comes from the verified claim, never from a body/query.
- Seam argument mapping is correct end-to-end (no swap):
  guard `isActiveMember(user.id, activeHouseholdId)` → `MembershipService(userId, householdId)`
  (`membership.service.ts:37`) → repo `isActiveMember(householdId, userId)` →
  `count({householdId, userId, status:"active"})`, backed by the unique compound index
  `{householdId, userId}`.
- Recipe read visibility (`recipe.repository.ts:69` `readableFilter`) ORs
  `scopeFilterFor(scope)` + `{scope:"system"}` + `{published:true}`, all AND-ed with
  `deletedAt:null`. A household's **unpublished** recipe is therefore not readable by another
  household (not in scope, not system, not published) → 404. Published recipes are
  intentionally cross-scope (community feed). e2e confirms outsider GET/PATCH/DELETE by id →
  404 across pantry/recipes/meal-plans/expenses (`household-scope.e2e-spec.ts:315-396`),
  including a hijack PATCH attempt.
- Shopping `generate` resolves the plan and the existing list **scoped**
  (`shopping.service.ts:71,107` `findById(scope,…)`/`findByMealPlanId(scope,…)`), so a
  member cannot reference or merge into another household's plan/list even though the
  `mealPlanId` unique index is global — a plan lives in exactly one bucket and only that
  bucket can generate for it, so the global key cannot collide cross-tenant.

### 2. Personal ↔ household bucket isolation — PASS
- `buildScopeFilter` (`scope-filter.ts:16`) partitions cleanly: personal
  `{scope:"personal", createdBy:userId}`, household `{scope:"household", householdId}`.
  `ScopedRepository.create` (`base.repository.ts:253`) stamps `scope`/`householdId`/`createdBy`
  from context, never caller input, and sets `householdId:null` for personal. Both buckets
  carry the scope discriminator, so `householdId:null` (personal) never collides with a real
  household. e2e proves both directions of invisibility for one user (`:276-313`).

### 3. Fail-safe fallback — PASS
- A revoked/stale-membership token drops to `{scope:"personal", userId, householdId:null}`
  (`scope.guard.ts:139`). This can only ever touch the caller's OWN personal bucket:
  reads filter `createdBy:userId`; writes stamp `scope:personal`. It cannot read a household
  bucket after removal and cannot write personal data into a household bucket (or vice-versa).
  Default binding is `DenyAllMembershipVerifier` (fail-closed) when no household module is wired.

### 4. Re-keyed unique indexes — PASS
- meal_plans / recipe_favorites / recipe_comments each split into a personal partial
  (`{…, createdBy}`, `partialFilterExpression:{deletedAt:null, scope:"personal"}`) and a
  household partial (`{…, householdId}`, `scope:"household"`). The scope equality in each
  partial filter makes the two indexes disjoint, so: no personal/household collision, no
  per-member duplicate inside a shared household, and no over-broad global uniqueness.
  Personal docs (householdId:null) are excluded from the household index by the partial
  filter, so the null does not collide. meal-plan create converges on the shared row and
  catches the duplicate-key race (`meal-plans.service.ts:65-75`, guarded by `isDuplicateKeyError`).
- One-review-per-household on ratings is internally consistent with the `{recipeId, householdId}`
  key; the aggregate recompute (`ratingStatsFor`) spanning scopes is correct for community recipes.

### 5. Preferences stay personal — PASS
- `getPreferences`/`updatePreferences` are `@Scope("personal")`. `RecipeSelectionService.select`
  reads preferences via `toPersonalScope(options.userId)` (`recipe-selection.service.ts:68`)
  while candidates/pantry come from the (possibly household) request scope. `autoFill` passes
  `userId: scope.userId` (`meal-plans.service.ts:151`). A member's allergens/diet are read from
  their own personal bucket and never blended with or overridden by another member's.

## Findings

### Medium

**M1 — Silent personal-scope fallback on an un-refreshed token fragments data into the wrong bucket.**
Household scope requires `activeHouseholdId` to be present in the JWT AND a live membership
check. The claim is only minted on a token refresh after create/accept (report §"Note on
issued tokens"). Between joining a household and refreshing, a member's requests resolve to
PERSONAL scope with no error — their pantry adds / expenses / recipes land in their personal
bucket, invisible to the household, and are not retroactively migrated. This is fail-SAFE for
isolation (no leak) but is a real data-consistency footgun: the correctness of sharing depends
on a client behavior ("mobile client already refreshes") that the server does not enforce or
signal. Consider (a) minting `activeHouseholdId` reactively / on every refresh (already done)
plus a server signal when the token's household claim is stale, or (b) documenting the window
as an accepted limitation. Not blocking, but should be tracked before multi-household work.
Evidence: `scope.guard.ts:129-139`; report lines ~75-78.

### Low

**L2 — Per-request membership DB round-trip on every feature route.**
Each `@HouseholdScope()` request now performs one `count({householdId, userId, status})`.
It is a single indexed lookup (unique `{householdId, userId}` index) so it is cheap and NOT
an N+1 (one query/request, not per-item). Informational: if these routes get hot, a short-TTL
membership cache would remove a DB hop from the request path. No action required now.

**L3 — Stale `@ApiOperation`/handler doc comments after the personal→household switch.**
Several summaries still say "the caller's own" for now-shared routes, e.g.
`recipes.controller.ts:77` ("List the caller's own recipes"), `:107`, `shopping.controller.ts:77`.
Cosmetic/doc drift; update the OpenAPI summaries to reflect household sharing.

**L4 — Pre-existing cross-suite flaky test (invite register → 401 under full in-band run).**
Builder-flagged (report §3). It reproduces only in the full in-band run and passes in
isolation, which points to shared throttler/auth state bleeding across e2e suites (a global
rate-limiter or in-memory store not reset between suites), not to this change. Worth isolating
throttle state per e2e suite (reset in `beforeEach`/`afterAll` or per-suite app instance) so a
real regression here is never masked by an ordering artifact. Not caused by Phase 08a.

## Tests
- New `test/household-scope.e2e-spec.ts` (8 cases) exercises real isolation meaningfully:
  shared reads/writes across two members, personal↔household bucket separation for one user,
  non-member 404 across every module (incl. a hijack PATCH), meal-plan per-week convergence,
  and the live expense→chat-card + budget-alert + notification path. Assertions check
  `scope === "household"`, bucket contents, and 404s — not weakened to pass.
- The 163 prior tests are preserved; the guard spec gained the household-preferred cases.
  I did not re-run the suite (per instructions: build already green at 175).

## Deferred-by-design (confirmed NOT defects)
- No active-household switch endpoint for multi-household users: a multi-household user can
  only act in the single household their claim points to, and `isActiveMember` verifies it —
  isolation holds. Aligns with stated constraints.
- Favorites/ratings being household-shared (one review per household): internally consistent;
  a product decision, not a security/correctness defect.

## Unresolved questions
1. Is there any non-mobile/API consumer that will NOT refresh its token after joining a
   household? If so, M1's wrong-bucket window applies to it silently.

Status: DONE_WITH_CONCERNS
Summary: Cross-tenant and personal/household isolation are sound (Critical 0, High 0); 1 Medium
(silent personal-bucket fallback on un-refreshed tokens — a data-fragmentation, not leak, risk)
and 3 Low (per-request membership lookup, stale API docs, pre-existing e2e flakiness).
Concerns/Blockers: M1 depends on client token-refresh behavior the server does not enforce;
confirm all API consumers refresh after join before relying on household sharing.
