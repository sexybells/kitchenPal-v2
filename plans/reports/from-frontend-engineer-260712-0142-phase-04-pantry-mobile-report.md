# Phase 04 — Pantry + AI Scan + Cook loop (mobile)

Frontend implementation of the pantry/scan/cook screens on the Phase 3 Expo +
Expo Router foundation. Backend/contracts consumed as-is; only `apps/mobile/**`
touched.

## Screens built

- **Pantry** (`app/(tabs)/pantry.tsx`, rewritten) — items grouped by category,
  stock-state pills, expiry badges, search (client-side over the fetched page),
  horizontal category filter chips, pull-to-refresh, and shared
  loading/empty/error/no-results states. Ingredients render the `leaf` LINE
  icon (never emoji). Header `+` opens the add sheet; a "Cook from pantry"
  action routes to the cook loop. Row press → edit sheet.
- **Add/Edit item sheet** (`app/pantry-item.tsx`, modal) — name, category
  (preset chips + any existing custom value), tracking mode (assistive
  `state_only` default), stock level, quantity+unit (shown only for
  quantity-tracked items), and expiry entered as days-remaining. Create/update
  via TanStack mutations; delete is optimistic. Edit loads from the warm
  pantry-list cache.
- **Scan capture** (`app/scan.tsx`, rewritten) — take-photo / choose-from-library
  via `expo-image-picker`, upload to `POST /pantry/scans`, then `router.replace`
  to the review with the scan id. Permission-denied and manual-entry fallbacks.
- **Scan AI review** (`app/scan-review.tsx`) — polls `GET /pantry/scans/:id`
  (1.5s while `pending`), seeds an editable row list from detections (qty
  stepper, per-row stock selector, low-confidence flag, add/remove rows),
  and confirms the final edited set via `POST /pantry/scans/:id/confirm`.
- **Cook from pantry** (`app/cook.tsx`, modal) — select in-stock items (qty
  stepper for tracked items), run the cook loop, then show consumed items +
  refill suggestions + unmatched. Doubles as the "cook from what you have" and
  "cook-this-meal" entry point (recipe/meal screens are Phase 5).
- **Home widgets** (`app/(tabs)/index.tsx`, rewritten) — real pantry stats
  (total / expiring-soon / running-low), an "Expiring soon" list (soonest-first,
  leveraging the backend expiry sort), and a "Running low" list wired to
  `GET /pantry/refill-suggestions`.

## Scan / degrade UX

The review distinguishes a real AI result from the honest degrade path. When the
scan is `degraded` (no keys / provider error) or returns zero detections, a
warning banner ("Nothing detected / add manually") shows, the row list starts
empty, and **Confirm is disabled until the user adds at least one manual row** —
no fabricated detections are ever shown. "Add item" seeds a blank editable row
(the manual "add missing" path). Client code never invents detections; it only
edits/confirms what the server returned or what the user typed.

## Cook / idempotency handling

`consume`/`cook` mutations exist (`useConsume`, `useCook`); the cook screen sends
a `uuid` `idempotencyKey` generated once per screen mount (stable across a
retry/double-tap so depletion can't double-apply). State-only items deplete by
step (no quantity); quantity-tracked items send an explicit amount clamped to
what's on hand. The returned `refillSuggestions` render in the result view.

## New components / modules

- `src/features/pantry/stock.ts` — stock→Badge tone map (success/info/warning/
  danger), expiry level + days math, category grouping, category localization,
  and the v4 idempotency-key generator.
- `StockPill`, `QuantityStepper`, `Segmented`, `PantryItemRow`, `ItemForm`
  (+ `buildItemPayload`), `ScanReviewRow`, `scan-review-model.ts`
  (detection↔row mapping + confirm payload builder), `image-source.ts`
  (camera/library wrapper, isolated so scan logic is testable with the image
  mocked).
- `src/api/pantry.ts` — enveloped, zod-validated endpoint wrappers mirroring
  `authApi`.
- `src/api/client.ts` — extended to pass a `FormData` body (multipart scan
  upload) while keeping the 401→refresh→retry path intact. Additive; all Phase 3
  client tests still pass.
- i18n: full `pantry`/`scan`/`cook`/`home` string sets added to vi (default) +
  en; the typed `TranslationBundle` guarantees key parity.

## Home wiring

Expiring-soon uses the list's built-in expiry sort (soonest first, no-expiry
last) filtered to dated items. Running-low + the low/out stat come from
`refill-suggestions`. Stats are pressable → Pantry.

## Verification (actual output)

- `pnpm --filter @kitchenpal/mobile typecheck` → clean (no output).
- `pnpm --filter @kitchenpal/mobile lint` → clean (no output).
- `pnpm --filter @kitchenpal/mobile test` → **11 suites, 30 tests passed**
  (4 new pantry suites: list grouping/empty/error; item-form payload +
  optimistic delete; scan-review edit→confirm + degrade→manual; cook
  idempotency + refill list).
- `pnpm --filter @kitchenpal/mobile build` (expo export web) → `Exported: dist`;
  routes include `/pantry-item`, `/scan-review`, `/cook`, `/(tabs)/pantry`.
- Root `pnpm build && pnpm lint && pnpm typecheck && pnpm test` → **all turbo
  task groups successful** (4 build / 6 lint / 6 typecheck / 6 test); backend +
  packages cache-hit (untouched); mobile 30 tests pass. Exit 0.

## Visual-parity notes

All color/spacing/radius/text from `rnTheme` — no ad-hoc hex/spacing. Stock pills
use the specified token mapping. Reused Screen/Button/Input/Chip/Card/Badge/
ListRow/Fab/Icon/StateViews rather than duplicating. Figma page ③ was not
re-opened via MCP; layout follows the established Phase-3 component look
(warm surfaces, card radius 18, line-icon ingredient badges).

## Deviations / assumptions

- **Single-page list, no infinite scroll.** `usePantryItems` fetches `limit:100`
  sorted by expiry and filters search/category client-side (fewer requests,
  no flicker). Cursor pagination is wired in the contract but not surfaced in
  the UI yet — a fast-follow if pantries exceed 100 items.
- **`confirmScan` response left unvalidated.** The backend report didn't specify
  the confirm response body; the flow just invalidates the pantry list and
  navigates, so the response is intentionally not schema-checked.
- **Categories** use a fixed preset set with localized labels; server-supplied
  custom categories render verbatim as group headers and are preserved on edit.
- **Expiry input** is entered as days-remaining (converted to an absolute date);
  no calendar picker to keep the sheet lightweight.
- **Cook = the AI-suggestions surface.** Phase 4 has no recipe-suggestion
  endpoint, so "cook from what you have" is an honest pantry-driven selection
  that calls the real `cook` loop rather than inventing a recommendations API.
- Added dependency: `expo-image-picker@~57.0.2` (SDK-57 bundled version), scoped
  to `apps/mobile`.
- Benign: jest prints a "worker failed to exit gracefully" notice from
  react-query background timers; all 30 tests pass. Not fixed (cosmetic).

## Unresolved questions

- Confirm-scan response shape — worth documenting so the client can surface the
  materialized items directly instead of refetching.
- Whether pantry list should move search/category to server-side filtering once
  pagination is surfaced.

Status: DONE
Summary: Built the Phase-4 mobile pantry/scan/cook screens (grouped pantry with
stock pills + search, add/edit sheet, camera→AI-review→confirm with an honest
keyless degrade path, cook loop with uuid idempotency + refill list, and
real-data Home widgets) on the Phase-3 foundation. Lint/typecheck/test/build all
green for mobile and workspace-wide; backend/packages untouched.
Concerns/Blockers: List pagination not yet surfaced (single 100-item page,
client-side filter) — fast-follow if pantries grow large.
