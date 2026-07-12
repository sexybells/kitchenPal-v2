# Phase 06 — Shopping & Spending (Mobile) — Report

Scope delivered: mobile Shopping + Spending screens on the Phase 3/4/5 foundation,
plus wiring the two previously-stubbed "add to shopping" seams to the real
`POST /shopping/needed-items`. Only `apps/mobile/**` touched. No backend/packages/root
changes.

## Note on repo state found
A prior partial attempt had left a consistent set of feature helpers plus
`app/expense-log.tsx`, `src/features/shopping/__tests__/add-missing-seam.test.tsx`,
and `src/features/spending/__tests__/analytics.test.ts` on disk (no i18n, no
budget/analytics/price-history screens, no route registration, no seam rewiring).
I reconciled everything into one consistent set: kept the good pre-existing
`expense-log.tsx` and the two prior tests (adjusting one chart expectation to match
the shipped `analytics.ts`), and completed the rest.

## API layer (`src/api/`)
- `shopping.ts` — `current`, `getById`, `generate`, `addNeededItems`, `addItem`,
  `updateItem`, `deleteItem`. Item mutations return the full updated list (bumped
  `version`) so the cache always holds the version the next guarded write must send.
- `spending.ts` — `listExpenses`, `createExpense`, `deleteExpense`, `currentBudget`,
  `createBudget`, `summary`, `stats`, `priceHistory`. Zod-validated via the shared client.

## Shopping (`src/features/shopping/`, `app/(tabs)/shopping.tsx`)
- `grouping.ts` (pure): `groupByCategory` (first-seen order, null→"other", unbought
  above bought), `summarize` (bought/remaining/complete).
- `expense-draft.ts` (pure): `buildExpenseDraftFromList` — checkout → expense prefill
  from BOUGHT lines (names+qty carried, prices blank, list linked).
- `labels.ts` — reuses the pantry `categoryLabel` for section headings.
- `hooks.ts` — `useCurrentShoppingList` (404 = "no list yet", not an error),
  `useGenerateList`, `useAddNeededItems`, `useAddShoppingItem`, `useDeleteShoppingItem`,
  `useToggleBought` (optimistic flip; on any error rolls back + invalidates → the
  **409 reconcile-by-refetch** path).
- `ShoppingItemRow.tsx` — checkbox toggle, struck-through bought line, amount, and the
  "từ công thức" source tag when `sourceRecipeId` is set.
- Screen: grouped checklist, inline add-item (name/qty/unit, sends `expectedVersion`),
  loading/error(non-404)/no-list/empty-list states, empty→generate-from-current-plan,
  and a checkout bar (progress + remaining) that routes to `/expense-log?listId=`.

## Spending (`src/features/spending/`, screens)
- `labels.ts` — `EXPENSE_CATEGORIES` + per-category color token + icon + label.
- `analytics.ts` (pure): `buildCategoryBreakdown` (share, drops zeros, sorted),
  `buildTrendChart` (SVG line geometry; single/flat series sits on the baseline),
  `buildSparkline` (reverses newest-first price points to chronological).
- `expense-form-model.ts` (pure): `computeItemsTotal`, `buildExpensePayload` (complete
  lines only, integer-đồng `totalAmount` = sum of line totals, or `null` when invalid).
- `hooks.ts` — `useCurrentBudget` (404 = "no budget yet"), `useSpendingSummary`,
  `useSpendingStats`, `useExpenses`, `usePriceHistory`, `useCreateExpense`,
  `useDeleteExpense`, `useCreateBudget`.
- Charts: `CategoryBars.tsx` (view proportion bars), `TrendChart.tsx` + `Sparkline.tsx`
  (react-native-svg — already a dep; **no new deps added**). All geometry is in the
  pure `analytics.ts`, so charts are hermetically testable apart from the renderer.
- `app/spending.tsx` — Overview: budget/remaining card (progress, over/on-track),
  category breakdown, recent expenses (with delete), quick links.
- `app/expense-log.tsx` (kept from prior attempt) — itemized name/qty/price auto-total,
  category, note, prefill + list link from checkout.
- `app/budget.tsx` — current cycle (amount/spent/remaining/dates) + set-budget form;
  **overlap 409 → localized `spending.budgetOverlapError`** (handled locally, so the
  shared `CONFLICT`→email-taken mapping used by auth is left untouched).
- `app/spending-analytics.tsx` — day/month trend line + category bars from `/spending/stats`.
- `app/price-history.tsx` — per-item latest price, min–max range, sparkline.

## Seam wiring (now LIVE)
- `src/features/recipes/add-missing-to-shopping.ts` — stub replaced with pure mappers
  `neededItemsFromMatch` (tags `sourceRecipeId`) and `neededItemsFromRefill`.
- `app/recipe.tsx` — add-missing now calls `useAddNeededItems` → `POST /shopping/needed-items`
  (loading/success/error states; success note instead of the old honest-stub note).
- `app/(tabs)/index.tsx` — Home "running low" card gained an "add to list" button that
  hands the refill suggestions to the same endpoint.

## Currency
`src/lib/currency.ts` — `formatVnd` (integer đồng → `12.000 ₫`, dot grouping, sign kept,
rounds any fraction), `formatVndDigits`, `parseVndInput`. All money display/parse flows
through it. VND is integer đồng end-to-end; no floats.

## i18n
Added full `shopping` and `spending` namespaces to vi (default) + en, plus
`meals.addMissingDone`; error handling stays on the existing localized map (409s handled
locally where semantics differ).

## Tests (jest-expo + RNTL, hermetic — api client mocked)
- `lib/__tests__/currency.test.ts` — VND format/parse incl. sign + rounding.
- `features/shopping/__tests__/shopping-logic.test.ts` — grouping/summary + checkout draft.
- `features/shopping/__tests__/shopping-list.test.tsx` — grouped render + source tag,
  optimistic toggle with `expectedVersion`, stale-409 rollback + refetch.
- `features/shopping/__tests__/add-missing-seam.test.tsx` — recipe add-missing posts the
  mapped needed items (with `sourceRecipeId`) to `/shopping/needed-items`.
- `features/spending/__tests__/analytics.test.ts` — chart transforms + expense payload/total.
- `features/spending/__tests__/budget-overlap.test.tsx` — budget 409 surfaces localized copy.

## Verification (actual)
Mobile (`pnpm --filter @kitchenpal/mobile ...`):
- typecheck: OK. lint: OK. test: **57 passed / 21 suites**. build (expo export web): OK —
  all new routes exported (`/shopping`, `/spending`, `/expense-log`, `/budget`,
  `/spending-analytics`, `/price-history`).

Workspace-wide:
- `pnpm build` ✓ 4/4 · `pnpm lint` ✓ 6/6 · `pnpm typecheck` ✓ 6/6 · `pnpm test` ✓ 6/6.
  Backend/packages untouched (cached).

(Test run prints React `act()` warnings + a react-query timer worker-exit notice after
completion — pre-existing harness noise shared with the pantry/recipe suites; exit code 0.)

## Deviations / notes
- Log Expense has no calendar date-picker: the kept `expense-log.tsx` omits an editable
  date field (server defaults the date to now; the form model still accepts a `date`).
  A YYYY-MM-DD field or picker is a low-risk follow-up if product wants back-dating.
- Generate-from-plan is offered from the Shopping empty state using the current meal
  plan; there is no separate "regenerate" affordance on a populated list (backend
  regenerate is idempotent, so this is safe to add later).
- Budget overlap 409 is localized locally rather than via the shared code→key map, to
  avoid changing the auth-facing `CONFLICT`→"email taken" mapping.

## Unresolved questions
- Expense edit: backend exposes create/list/delete only (no PATCH). Recent-expense rows
  support delete; editing means delete + re-log. Confirm that is the intended UX.
- Price-history / analytics range currently defaults to the active budget cycle (server
  default). No custom date-range picker on mobile yet — add if product wants arbitrary ranges.

Status: DONE
Summary: Shopping checklist (grouped, optimistic version-guarded bought toggle with
409 reconcile, checkout→expense prefill) and the full Spending suite (overview, log
expense, budget with overlap 409, analytics charts, price history) are built on the
existing foundation, both add-missing seams now hit `POST /shopping/needed-items`, and
all mobile + workspace gates are green (57 mobile tests).
Concerns/Blockers: none blocking; expense-edit UX and custom analytics ranges flagged for product.
