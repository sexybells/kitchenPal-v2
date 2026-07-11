# Phase 5 — Meals & Recipes Backend Review

Reviewer pass focused on authorization correctness and data integrity. Every finding
below is verified against the working-tree source (file:line + scenario). Code was not
modified.

## Scope
- `apps/backend/src/modules/recipes/**` (controllers, services, repos, schemas, ai/)
- `apps/backend/src/modules/logs/*` (ExternalSearchLog)
- `packages/api-contract/src/{recipes,meal-plan}.ts`
- Platform reused: `common/database/{base.repository,scope-filter}.ts`, `common/scope/*`

## Overall Assessment
The visibility/authorization model is sound and consistently applied — this is the
strongest part of the phase. The `readableFilter` + `requireReadable`/`requireOwned`
split correctly separates "can see" from "can mutate", scope is server-derived (not
caller-controlled), and the AI ranker cannot inject recipe ids outside the readable
candidate set. Two real trust-boundary/integrity defects need attention before this is
production-safe: an SSRF in URL import, and unbounded self-rating that lets one user
skew a recipe's community rating. Pantry-match substring logic has a data-integrity
false-positive worth fixing. No stray/duplicate/orphan files remain from the flagged
concurrent-writer episode.

---

## Critical Issues
None that are unconditionally critical. The SSRF (High, below) becomes Critical in a
cloud deployment with an unprotected instance-metadata endpoint; see notes there.

## High Priority

### H1 — SSRF: `import-from-url` fetches an arbitrary user-supplied URL server-side
- `recipe-http-client.ts:26-41` (`FetchRecipeHttpClient.getText`) does `fetch(url, { redirect: "follow" })` on a URL that originates directly from the request body.
- The only validation is `importFromUrlSchema = z.object({ url: z.string().url() })` (`packages/api-contract/src/recipes.ts:230-232`). `z.string().url()` accepts `http://169.254.169.254/...`, `http://localhost:*`, `http://10.x`, `http://192.168.x`, etc. `grep` confirms **no** host/IP allowlist or private-range block anywhere in the module.
- Path: `RecipesController.importFromUrl` → `RecipesService.importFromUrl` → `RecipeImportService.importFromUrl(url)` → `http.getText(url)`.
- Impact: an authenticated user can coerce the backend into GET requests against the internal network and cloud metadata endpoints, plus enumerate internal services. `redirect: "follow"` means even a public URL can 302 into an internal address. Reflection of secrets is limited (the JSON-LD parser only extracts `<script type="ld+json">` blocks, so a plain-text metadata body yields a null draft), but blind SSRF, internal port/endpoint probing, and status disclosure (`"Fetch failed with status ${status}"` is returned in `warnings`, `recipe-import.service.ts:43`) remain.
- Fix: before fetching, resolve the host and reject private/loopback/link-local/reserved ranges (and re-validate on every redirect hop, or set `redirect: "manual"` and validate each `Location`). Restrict protocol to `http(s)` explicitly. Consider an egress proxy/allowlist. This is the classic mitigation and should not be deferred.

### H2 — Rating integrity: a single user can submit unlimited ratings on one recipe
- `RecipesService.addComment` (`recipes.service.ts:277-292`) always calls `comments.create(...)` — there is no per-user uniqueness check or upsert.
- `RecipeComment` schema (`schemas/recipe-comment.schema.ts:16-30`) has **no** unique index on `(recipeId, createdBy)`.
- `ratingStatsFor` (`repositories/recipe-comment.repository.ts:42-62`) averages `$rating` over *all* non-deleted comments and `$sum: 1` for `reviewCount`.
- Impact: one user can POST `/recipes/:id/comments` repeatedly to drive `averageRating` to 5 (or 1) and inflate `reviewCount` arbitrarily on any readable recipe — including another user's published community recipe or system content. This directly corrupts the community feed's `rating`/`popular` sorts (`recipe.repository.ts:40-47`).
- Fix: enforce one rating per user per recipe — unique index on `(recipeId, createdBy, deletedAt)` plus upsert-on-conflict in `addComment` (update the existing comment's rating/text instead of inserting). This also makes `reviewCount` mean "distinct reviewers".

## Medium Priority

### M1 — pantry-match: bidirectional substring produces false "available" (drops needed items)
- `pantry-match.ts:56-69`: `target.includes(item.normalized) || item.normalized.includes(target)`.
- Scenario: pantry has `"egg"` (in stock), recipe needs `"eggplant"`. `"eggplant".includes("egg")` → `true` → eggplant is classified **available** and removed from the `needed` list that is the shopping hand-off (`pantryMatchResponseSchema.needed`, `recipes.ts:270-280`). Same for `"salt"` vs `"salted butter"`, `"flour"` vs `"cauliflower"` (`"cauliflower".includes("flour")` → true), etc.
- Impact: silently drops real ingredients from the to-buy list and overstates `matchScore` — a data-integrity defect for the downstream shopping module, and the false direction is the dangerous one (user never told to buy the item).
- Fix: match on normalized whole-word/token boundaries (split on whitespace and compare tokens, or require exact token containment) rather than raw `String.includes` in both directions. Note `preference-filter.ts:61-64` uses the same `includes` shape for allergen exclusion — there the failure is fail-safe (over-exclude), so lower urgency, but worth aligning on one tokenizer.

## Low Priority

### L1 — No unique guard against duplicate meal plans for the same week
- `MealPlansService.create` (`meal-plans.service.ts:47-63`) reads `findByWeekStart` then creates; `MealPlan` schema (`schemas/meal-plan.schema.ts:39-46`) has no unique index on the owner+`weekStart`. Two concurrent `POST /meal-plans` for the same week can both insert. Low impact (duplicate empty plan), but a unique index on `(createdBy, weekStart)` / `(householdId, weekStart)` would make the "return existing rather than duplicate" intent race-safe.

### L2 — Duplicate favorites possible under concurrency
- `toggleFavorite` (`recipes.service.ts:206-221`) check-then-create with no unique index on `RecipeFavorite (recipeId, createdBy)`. Concurrent double-favorite can insert two rows; `listFavorites` would then show the recipe twice. Add a unique partial index.

### L3 — Empty-target ingredient matches any in-stock item
- `pantry-match.ts:61-62` guards `item.normalized.length > 0` but not `target.length > 0`. A whitespace-only ingredient name (`" "` passes `recipeIngredientSchema.name.min(1)` since length is 1) normalizes to `""`, and `item.normalized.includes("")` is always `true` → marked available. Edge case; add a `target.length > 0` guard.

### L4 — Review author raw user id exposed to all readers
- `toCommentResponse` (`recipes.service.ts:479-488`) returns `userId` (the raw `createdBy` ObjectId) to any reader of `/recipes/:id/comments`. Expected for a public reviews feature, but exposing internal user ids (vs. a display name/handle) is a minor data-exposure choice — confirm it's intended.

---

## Verified Correct (checked, no defect)

- **Read visibility / IDOR (Priority 1):** `readableFilter` = `{ deletedAt:null, $or:[ scopeFilterFor(scope), {scope:"system"}, {published:true} ] }` (`recipe.repository.ts:69-78`). For a personal caller this is own-personal + system + any-published — a *non-published* personal recipe of another user is not readable. Confirmed via `scopeFilterFor` = `{scope:"personal", createdBy:userId}` (`scope-filter.ts:16-24`).
- **Mutation ownership:** `update`/`remove`/`setPublished` all go through `requireOwned` (`recipes.service.ts:451-468`), which uses the *scoped* `findById` (owner-only) and returns 403 for readable-but-not-owned, 404 for missing — never a silent allow. `remove` re-checks ownership when the scoped soft-delete matches nothing (`recipes.service.ts:183-189`). Every `:id` route has a guard: `getById`/`favorite`/`comments`/`pantry-match` → `requireReadable`; `update`/`delete`/`publish` → `requireOwned`. No missing guard.
- **Cross-scope reads never disable the scope filter:** community feed filters `{deletedAt:null, published:true}` (`recipe.repository.ts:162-176`); `findReadableById/ByIds`/`findCandidates` all layer `readableFilter`. `ScopedRepository` injects the scope filter on every scoped read/write with no bypass (`base.repository.ts:200-281`).
- **Scope is not caller-controlled:** `@Scope("personal")` metadata is read server-side by the guard; `create` stamps `scope`/`createdBy` from the context, never the body (`base.repository.ts:247-257`).
- **AI safety (Priority 2):** `parseOrder` keeps only ids in the candidate `Set` and drops dupes (`recipe-ai.service.ts:166-191`); `orderBy` reorders from the analyzed map and skips unknown ids (`recipe-selection.service.ts:118-131`). Candidates come from `findCandidates` (readable only). Preference filtering (`satisfiesPreferences`) is applied to `candidates` **before** ranking (`recipe-selection.service.ts:67-95`). Degrade is honest: no provider/keys → `order:null`, heuristic ordering, `degraded:true`, never fabricated recipes (`recipe-ai.service.ts:52-60`, module factory `recipes.module.ts:50-75`).
- **Auto-fill (Priority 2):** fills only `recipeId === null` slots unless `overwrite` (`meal-plans.service.ts:124,154`), assigns only ids from readable ranked candidates, and persists via a **single** `updateWithVersion(scope, plan.id, plan.version, ...)` (`meal-plans.service.ts:173-178`) — a concurrent edit bumps version → 409, no lost update. `updateSlot` validates `input.recipeId` is readable before assignment (`meal-plans.service.ts:98-101`) and uses `expectedVersion`.
- **Import draft→confirm (Priority 4):** `importFromUrl` only scrapes/parses and returns a draft — it never calls `recipes.create` (`recipes.service.ts:353-359`, `recipe-import.service.ts`). Only `confirmImport` creates (`recipes.service.ts:361-381`). Scraped JSON-LD is re-validated with `recipeDraftSchema.safeParse` and degrades on failure; malformed JSON is skipped, not thrown (`recipe-jsonld-parser.ts:64-84`); the HTTP client is behind a DI token so tests inject canned responses (`recipe-http-client.ts:12-17`, `recipes.module.ts:77-81`). Body is capped at 2 MB and requests time out at 8 s. (SSRF is the one gap — H1.)
- **Rating recompute correctness (Priority 5):** `ratingStatsFor` aggregates across all scopes via model-direct query and is applied without a version guard (`recipe.repository.ts:106-121`) — correct, since the recipe owner did not initiate the write and it must not force reader retries. The math (`$avg`, rounded to 2dp) is correct; the only issue is the missing dedupe (H2).
- **External search:** fixed Google CSE endpoint, honest degrade with no key, API key is passed in the request URL but **not** persisted (log stores `query`, `url:null` — `external-search.service.ts:107-116`). No SSRF (endpoint is constant).
- **Stray artifacts (Priority 6):** the entire `modules/recipes/` tree is new/untracked; no `.bak/.orig/copy/old` files, no duplicate/competing service or repo implementations, and every provider/service/repo is wired in `recipes.module.ts`. The flagged concurrent-writer consolidation appears complete and clean.

## Edge Cases Scouted
- Favorited recipe later unpublished/deleted → dropped from `listFavorites` via `findReadableByIds` (`recipes.service.ts:223-233`). No stale leak.
- Meal-plan slot referencing a now-unreadable recipe → rendered as null summary (`meal-plans.service.ts:245-256`). No leak.
- `search`/regex list filter escapes user input before `$regex` (`recipe.repository.ts:220-222`). No ReGeXi injection.
- `slotId` param has no Zod pipe (`meal-plans.controller.ts:75`) but is only used in an equality `find`, so no injection — cosmetic inconsistency only.

## Recommended Actions (prioritized)
1. **H1** — Add private/loopback/link-local IP + protocol allowlisting to the import fetch (validate every redirect hop). Do not defer.
2. **H2** — Enforce one rating per user per recipe (unique index + upsert in `addComment`).
3. **M1** — Replace bidirectional `String.includes` in pantry-match with token/word-boundary matching.
4. **L1/L2** — Add unique indexes for meal-plan-per-week and favorite-per-recipe.
5. **L3/L4** — Guard empty `target`; confirm exposing raw reviewer user ids is intended.

## Metrics
- Type coverage: strong; no `any` widening in reviewed code (a few justified `as unknown as never` casts for the log `userId` field).
- Tests present: `recipe-ai.service.spec.ts`, `apps/backend/test/recipes.e2e-spec.ts`, `packages/api-contract/src/__tests__/recipes-contract.test.ts`. Not re-run here (task states suite is green). Note: none of the reviewed tests would catch H2 (unbounded self-rating) or M1 (substring false-positive) — add cases.
- Linting: not run (review-only, no edits).

## Unresolved Questions
- Is instance-metadata (169.254.169.254) reachable in the target deploy environment? That determines whether H1 is High or Critical.
- Is one-rating-per-user the intended product rule (H2), or are multiple reviews per user by design? If the latter, `reviewCount` semantics and skew-resistance still need a decision.

Status: DONE_WITH_CONCERNS
Summary: Authorization/visibility model is correct and consistently applied; found 2 High (SSRF in URL import, unbounded self-rating skew), 1 Medium (pantry-match substring false-positive drops shopping items), 4 Low. No stray/duplicate files.
Concerns/Blockers: H1 (SSRF) and H2 (rating integrity) should be fixed before production; both are authenticated-user-reachable trust-boundary/integrity defects.
