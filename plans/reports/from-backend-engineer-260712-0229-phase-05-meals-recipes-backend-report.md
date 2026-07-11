# Phase 5 — Meals & Recipes Backend

Backend + shared contracts for recipes (personal/household/system + community),
AI suggestions, URL import (draft→confirm), weekly meal planning with auto-fill,
and pantry-match. Built on the existing common infra and Phase 4 pantry/AI
patterns. Scope: `apps/backend/**` + `packages/api-contract/**` only.

The full initial implementation report (entities, endpoints, visibility model,
pantry-match algorithm, AI degrade design, import flow, contracts, first
verification run) was delivered inline to the coordinator. This file records the
code-review fixes.

---

## Review fixes applied (round 1)

Source: `from-code-reviewer-260712-0256-phase-05-recipes-backend-review.md`
(authorization/visibility model verified CORRECT; fixed the integrity/trust
defects below). No git commit — coordinator commits.

### H1 — SSRF in `import-from-url` (fixed)
`apps/backend/src/modules/recipes/ai/recipe-http-client.ts`
- Added `assertPublicUrl(url)`: rejects non-http(s) schemes; resolves the host
  (DNS `lookup(all:true)` or IP literal) and blocks EVERY resolved address that
  is private/loopback/link-local/reserved.
- `isBlockedAddress` covers IPv4 (0/8, 10/8, 127/8, 169.254/16 incl. metadata,
  172.16/12, 192.168/16, 100.64/10 CGNAT, 224/4+240/4) and IPv6 (`::1`, `::`,
  `fc00::/7`, `fe80::/10`, and IPv4-mapped `::ffff:` extraction). Unparseable →
  blocked (fail-closed).
- `FetchRecipeHttpClient.getText` now uses `redirect:"manual"`, re-validates the
  target on EVERY hop (max 3), keeps the 8s timeout + 2MB body cap.
- A blocked URL throws `BlockedAddressError`, which the import service treats as
  any fetch failure → null draft (no distinguishing SSRF signal).
- Test: `recipe-http-client.spec.ts` (4 cases) asserts loopback/private/link-
  local/metadata/IPv6 literals are blocked, public IPs allowed, non-http(s)
  rejected, and `getText` rejects a metadata/loopback URL before any fetch.

### H2 — Rating vote-stuffing (fixed)
- Unique partial index on `RecipeComment (recipeId, createdBy)` where
  `deletedAt:null` (`schemas/recipe-comment.schema.ts`).
- `addComment` now upserts: `RecipeCommentRepository.findOwnByRecipe(scope,id)` →
  version-guarded update of the caller's existing rating, else create. Aggregate
  recomputed from the deduped set. `reviewCount` now means distinct reviewers.
- `toggleFavorite`/meal-plan create catch `isDuplicateKeyError` (new
  `common/database/mongo-errors.ts`) so a concurrent race is idempotent, not a 500.
- Test (e2e): same user rating 2 then 5 → `reviewCount=1`, `averageRating=5`,
  one comment row.

### M1 + L3 — pantry-match false positives (fixed)
`services/pantry-match.ts`
- Replaced bidirectional `String.includes` with whole-word token-set containment
  (subset in either direction). "egg" no longer satisfies "eggplant", "salt" no
  longer satisfies "salted butter"; "flour" still satisfies "2 cups flour";
  "chicken" still satisfies "chicken breast". Blank ingredient name never matches
  (L3).
- Test: `pantry-match.spec.ts` (6 cases) covers all of the above + optional-
  ingredient scoring + out-of-stock.

### L1 / L2 — duplicate-row indexes (fixed)
- Unique partial index `MealPlan (createdBy, weekStart)` and `RecipeFavorite
  (recipeId, createdBy)`, both `where deletedAt:null`; services handle the
  duplicate-key race gracefully (return existing / treat as success).

### L4 — reviewer id exposure (fixed)
- `RecipeComment` gains a denormalized `authorName` (captured from the user's
  display name at write via the exported `UserRepository`; `AuthModule` imported
  by `RecipesModule`). `recipeCommentResponseSchema` now returns `authorName`
  instead of the raw `userId` (contract tweak). e2e asserts `authorName` present
  and `userId` absent.

Not changed (deliberate): `preference-filter.ts` allergen matching stays
substring — there over-exclusion is fail-safe (never lets a blocked allergen
through), so no integrity risk; left minimal to avoid scope creep. Noted by the
reviewer as low-urgency.

### Verification (actual)
- `@kitchenpal/api-contract build` ✓ + `test`: 22 passed (3 files).
- backend: `typecheck` ✓, `lint` ✓ (no `any`, no warnings), `build` (`nest build`) ✓.
- backend `test`: 18 suites, **117 passed** (was 106; +11: SSRF 4, pantry-match
  token 6, one-rating-per-user e2e 1).
- Root `pnpm build && lint && typecheck && test`: all 6 tasks successful
  workspace-wide; mobile untouched.

### Open questions
- H1 severity depends on whether instance-metadata is reachable in the deploy
  env (guard now blocks it regardless).
- Confirmed one-rating-per-user as the product rule (implemented). Free-text-only
  comments-without-rating are not a separate feature; the schema couples a
  required rating with optional text, so each review is one rating.

Status: DONE
Summary: All 2 High (SSRF, rating vote-stuffing), 1 Medium (pantry-match token
matching), and 4 Low review findings fixed with tests; api-contract + backend +
root build/lint/typecheck/test all green (117 backend tests), mobile untouched.
Concerns/Blockers: none.
