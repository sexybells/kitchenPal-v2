# Phase 5 — Meals & Recipes (Mobile)

Built the Meals/Recipes/Detail/Import UI on the Phase 3/4 foundation. All work is
in `apps/mobile/**`; backend, packages, and root config untouched. No git commit
(controller commits).

## Files

New API layer
- `src/api/recipes.ts` — `recipesApi` + `mealPlansApi`: envelope+zod wrappers for
  every recipe/meal-plan endpoint, mirroring `pantryApi` (favorites/comments
  unwrap their `{recipes}`/`{comments}` objects; `pantry-match`, `import-from-url`,
  `imports/confirm`, `auto-fill`, versioned `slots/:slotId` all typed).

New recipes feature (`src/features/recipes/`)
- `hooks.ts` — query keys + hooks (list/community/favorites, detail, comments,
  pantry-match, optimistic favorite toggle, add-comment, publish, import, confirm,
  create; meal-plan current/create/update-slot/auto-fill).
- `labels.ts` — meal-type/day labels, dish-emoji thumbnails, `startOfWeekUtc`,
  star-fill helper.
- `RecipeCard.tsx`, `RecipesBrowser.tsx` — 2-col grid, collection switch
  (Mine/Community/Favorites), search, meal-type chips, featured community card,
  optimistic favorite heart.
- `RatingStars.tsx` — read-only + interactive star row.
- `IngredientChecklist.tsx` — pantry-match có sẵn / cần mua split (line icons per
  the ingredient rule) + a plain `IngredientList` fallback.
- `MealSlotCard.tsx`, `MealPlanner.tsx`, `RecipePicker.tsx` — weekly planner: day
  selector, per-meal slot cards, empty-slot add (modal picker), AI auto-fill,
  versioned edits.
- `RecipeDraftForm.tsx` — reviewable/editable draft form shared by URL-import and
  manual entry (`stateToDraft`/`draftToState`).
- `add-missing-to-shopping.ts` — the clearly-marked shopping hand-off stub.

New screens
- `app/recipe.tsx` — detail (hero, meta, pantry-match checklist, add-missing,
  cook-this-meal, steps, ratings/comments, publish).
- `app/recipe-import.tsx` — URL import → draft preview → confirm, plus manual.

Modified
- `app/(tabs)/meals.tsx` — replaced placeholder with segmented Kế hoạch / Công thức.
- `app/_layout.tsx` — registered `recipe` (card) + `recipe-import` (modal) routes.
- `src/ui/icons/Icon.tsx` — added heart/heart-filled, star/star-filled, clock,
  users, link, sparkles, camera glyphs.
- `src/i18n/locales/{vi,en}.ts` — full `meals.*` namespace (vi default + en),
  including dynamic `collection.*`, `day.0..6`, `mealType.*` keys.

Tests (`src/features/recipes/__tests__/`, hermetic, api mocked)
- `recipes-browser` (grid + optimistic favorite flip), `recipe-detail`
  (pantry-match có sẵn/cần mua split), `recipe-import` (URL→draft→confirm with the
  edited draft + sourceUrl preserved), `meal-planner` (auto-fill renders filled
  slot; slot edit sends `expectedVersion`, 409 → conflict banner + refetch);
  `recipe-fixtures.ts`.

## Key UX / behavior

- Pantry-match: detail calls `POST /recipes/:id/pantry-match`; the checklist shows
  the `available`/`needed` split with a match-score line. Before the match loads
  it falls back to the plain recipe ingredient list (no fake pantry state).
- Cook-this-meal: reuses the Phase 4 cook loop (`useCook` → `pantryApi.cook`) with
  a per-screen idempotency key, depleting the matched `available` pantry items and
  surfacing the depleted count; refill is handled by the existing loop.
- Add-missing-to-cart: wired to `add-missing-to-shopping.ts`, a documented STUB
  that returns the `needed` count and `persisted:false`. It does NOT write a
  shopping list (Shopping is Phase 6); the seam names the exact call to add later.
- Meal-plan version handling: every slot edit sends `expectedVersion` from the
  cached plan. A 409 (`OPTIMISTIC_LOCK_CONFLICT`) refetches `current` and shows a
  "changed elsewhere, reloaded, retry" banner instead of losing the edit.
- Auto-fill honesty: `needsManual` → "add meals manually" note; `degraded` →
  "AI unavailable, basic heuristics" note. Filled slots render from the returned
  plan.
- No-plan-this-week (`getCurrent` 404) is treated as expected → a "create weekly
  plan" empty state, not an error.
- Import degrade: a null/degraded scrape falls back to the editable manual form
  with a warning; nothing is created until confirm.
- Ratings: one interactive rating + optional text per user (backend upserts);
  comments list shows `authorName` (no raw user ids).
- Publish action shown only for the owner's personal recipe.

## Verification (actual)

- `pnpm --filter @kitchenpal/mobile lint` — clean (eslint, no `any`, no warnings).
- `pnpm --filter @kitchenpal/mobile typecheck` — clean (tsc `--noEmit`).
- `pnpm --filter @kitchenpal/mobile test` — 15 suites, 35 passed (5 new recipe
  tests + existing 30).
- `pnpm --filter @kitchenpal/mobile build` — `expo export` → `Exported: dist`
  (routes include `(tabs)/meals`, `recipe`, `recipe-import`).
- Root `pnpm build && pnpm lint && pnpm typecheck && pnpm test` — all 6 tasks
  successful each; mobile 35/35. Backend/packages untouched.

Note: jest prints a "worker did not exit gracefully" warning (pre-existing
React-Query timer teardown) and a console stack from the deliberate 409-rejection
in the planner test; both are noise — all suites exit 0.

## Deviations / assumptions

- Import "photo optional": there is no recipe-image upload endpoint in the
  contract (recipe `imageUrl` is a URL, and the scan-upload path is pantry-only),
  so I did not add a fake photo upload. The draft form keeps `imageUrl` as data
  from the scrape; a camera capture → hosted-URL step is deferred until an image
  endpoint exists. Manual entry works without a photo.
- External web-search (`GET /recipes/external-search`) and AI suggestion
  endpoints have API wrappers but no dedicated screen yet — out of the four
  required screens; can be surfaced from the browser/import later without new
  contracts.
- `meals` tab always scrolls (Screen scroll) so both panes' grids/slot lists are
  reachable; each pane keeps its own horizontal filter strips.

## Unresolved questions

- Favorite membership isn't in `RecipeResponse`, so a heart in Mine/Community
  starts un-filled and reflects only in-session toggles (Favorites collection is
  authoritative). If persistent heart state on those lists is desired, the
  contract needs an `isFavorite` flag.
- Confirm the intended home for external-search/AI-suggestion UI (import screen
  vs. a discovery surface) before wiring those wrappers to a screen.

Status: DONE
Summary: Meals planner, recipe browser (community/favorites), recipe detail with
pantry-match + Phase-4 cook loop + shopping stub, and URL/manual import are built,
i18n'd (vi+en), and covered by 5 hermetic tests; mobile lint/typecheck/test/build
and the full workspace build/lint/typecheck/test are all green with backend and
packages untouched.
Concerns/Blockers: none.
