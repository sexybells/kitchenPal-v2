# Mobile App Consolidated Review — KitchenPal (`apps/mobile`)

Scope: feature screens/hooks added in phases 4–8 (pantry/scan/cook, meals/recipes,
shopping/spending, household/chat, notifications, paywall). Data layer + auth/refresh
skimmed only for consumption. Tests: 81 pass. Focus per brief: money/mutation
correctness, cache integrity, error/empty/loading, token hygiene, consistency.

Verdict: DONE_WITH_CONCERNS. One High correctness bug (wrong localized error on a
real 409 path), plus several Medium cache/UX gaps. No Critical data-loss or
token-exposure issues found. Money display is uniformly integer-VND via `formatVnd`
(no float leaks), and the optimistic-update rollback patterns are sound.

---

## Critical
None.

## High

### H1. Generic `CONFLICT` is mislabeled as "email already in use" on non-auth 409s
`src/lib/error-message.ts:33` maps backend `CONFLICT` → `errors.emailTaken`
("That email is already in use." / "Email này đã được sử dụng.").

The backend reuses `ErrorCode.CONFLICT` for many non-auth conflicts, verified:
- `apps/backend/src/modules/pantry/services/pantry-scan.service.ts:188,195,213`
  — "Scan has already been confirmed" / "not ready" / "already being confirmed".
- `apps/backend/src/modules/shopping/services/spending.service.ts:177` — budget overlap.
- `apps/backend/src/modules/auth/services/auth.service.ts:82,325` — the actual email case.

Reachable failure: on **scan-review**, `confirm.error` is rendered via
`resolveErrorMessage` (`app/scan-review.tsx:98-101`). A double-confirm / stale scan
returns 409 `CONFLICT` → the user sees **"That email is already in use."** on the
pantry scan screen. Same misfire for any future `CONFLICT` surfaced through the
resolver. (Budget overlap is masked only because `budget.tsx:23` special-cases 409 by
status *before* calling the resolver.)

Fix: stop folding `CONFLICT` onto `emailTaken`. Map `CONFLICT` to a neutral
`errors.conflict` message and have the sign-up/login screens special-case the
email-taken case by status (as `budget.tsx` already does for overlap), or push the
backend to emit a distinct code (e.g. `EMAIL_ALREADY_EXISTS`) for the auth path.
Also add a mapping for `OPTIMISTIC_LOCK_CONFLICT` (currently unmapped — see M1).

## Medium

### M1. Error resolver leaks raw server (English) strings for unmapped codes
`src/lib/error-message.ts:48-49` — docstring claims it "never leak[s] a raw
synthetic/English message", but the unknown-code branch returns `error.message`
verbatim. Unmapped codes include `OPTIMISTIC_LOCK_CONFLICT`,
`INTERNAL_SERVER_ERROR`, `FORBIDDEN`, `SERVICE_UNAVAILABLE`, and every backend
message string is English (e.g. `spending.service.ts:179`
"An active budget already covers this period…"). Any screen calling the resolver on
those surfaces raw English. Fix: add keys for the remaining `ErrorCode` values and
fall back to a generic localized message instead of `error.message`.

### M2. Cooking from a recipe leaves the pantry-match split stale
`app/recipe.tsx:99-105` fires `useCook()`, whose `onSuccess` only invalidates
`["pantry"]` (`src/features/pantry/hooks.ts:140`). The recipe's match lives under
`recipeKeys.pantryMatch(id)` (`recipes/hooks.ts:31`), which is **not** invalidated.
After "Cook this meal", the "có sẵn / cần mua" checklist still shows the just-consumed
items as on-hand until a manual refetch. Fix: after cook success on the detail
screen, invalidate `recipeKeys.pantryMatch(recipeId)` (and `detail`), or have
`useCook` accept an optional recipe id to invalidate.

### M3. Shopping add-item failure is silent; toggle/delete conflicts give no feedback
`app/(tabs)/shopping.tsx:60-79` — `addItem.error` is never rendered anywhere in the
screen, and `onAdd` has no `onError`. A 409 (`OPTIMISTIC_LOCK_CONFLICT` because
another member mutated the list, bumping `version`) or a network failure produces
**no** user-visible signal; the input just isn't cleared. Likewise `useToggleBought`
(`shopping/hooks.ts:117-121`) rolls back and refetches on error but shows nothing, so
a rejected toggle silently flips the checkbox back. Note the row `disabled` guard
(`shopping.tsx:206`) covers `toggle`/`remove` but **not** `addItem.isPending`, so a
toggle fired during an in-flight add races on the same stale `version` and loses
silently. Fix: render `addItem.error`; show a transient "list changed, try again"
banner on 409 for toggle/delete.

### M4. Chat typing timers are never cleared → leaked timers + early clears
`src/features/chat/hooks.ts:104-106` — every incoming `typing` signal schedules a
bare `setTimeout` that calls `setTypingUserIds` after `TYPING_TTL_MS`, with no
cleanup on unmount and no per-user tracking. Consequences: (a) state update after
unmount; (b) a peer who keeps typing has multiple stacked timers, and the first to
fire removes them from the set even while still active. The Jest run confirms leaked
timers ("A worker process has failed to exit gracefully… Active timers can also cause
this"). Fix: keep a `Map<userId, timeoutId>`, reset the timer on each repeat signal,
and clear all timers in the effect cleanup.

### M5. Chat image-send failure is swallowed
`app/chat.tsx:48-56` calls `sendImage.mutate(asset.uri)` and never renders
`sendImage.error`, and there's no optimistic bubble. On failure the user taps attach,
picks a photo, and nothing appears with no explanation. (Real upload of the native
URI is deferred-by-design, but the error surfacing is not.) Fix: surface
`sendImage.error` and/or an optimistic pending image bubble like text sends.

## Low

### L1. `useMarkAllRead` aborts invalidation on any single failure
`src/features/notifications/hooks.ts:35-39` — `Promise.all` rejects if any one
`markRead` fails, so `onSuccess` (list invalidation) never runs even though some were
marked; the UI stays stale until the next refetch. Consider `Promise.allSettled` +
always-invalidate.

### L2. Vote-cast failures are silently swallowed
`src/features/chat/hooks.ts:176-177` — `.catch(() => undefined)`. A failed vote gives
the user no feedback. Low, but inconsistent with the text-send failed-state handling.

### L3. Expense price input is unformatted while budget input is grouped
`app/expense-log.tsx:151-157` shows the raw typed digits for each line price, whereas
`app/budget.tsx:106` displays `formatVndDigits(parsed)`. Both store correct integers;
purely a UX inconsistency (no correctness impact).

### L4. Paywall renders server-provided feature strings verbatim
`src/features/subscription/PlanCard.tsx:58-63` maps `plan.features` (server strings)
straight into `<Text>`. If backend copy is English this bypasses i18n. Server-owned
content, so note-only.

---

## Verified-good (risk calibration)
- Money is integer-VND end to end; every display path routes through `formatVnd`
  (`budget.tsx`, `PlanCard.tsx`, `expense-log.tsx` footer). `toFixed`/`toLocaleString`
  appear only on quantities/ratings, never money. No float display.
- Optimistic rollback is correct in `useDeleteItem` (pantry), `useToggleFavorite`,
  and `useToggleBought` (snapshot in `onMutate`, restore in `onError`, reconcile via
  invalidate/`setCurrentList`).
- `MealPlanner` slot-edit 409 handling is exemplary: refetch + user-facing
  `slotConflict` banner, no silent loss (`MealPlanner.tsx:70-78`).
- Cook idempotency key is a per-session `useRef` reused across retries in both
  `cook.tsx:43` and `recipe.tsx:57` — correct idempotent-retry semantics.
- Socket rejoins on every (re)connect (`socket.ts:117-125`) and `joinRejected` is
  handled in the chat UI (`chat.tsx:110-115`). No tokens in query keys, params, deep
  links, or logs (no `console.*` in feature/app code; access token read from session
  store only at handshake).
- i18n key parity: `en.ts` and `vi.ts` both 410 keys; no hardcoded hex or spacing in
  feature/app code (all via `theme`).

## Unresolved questions
- H1/M1: does the team prefer fixing the overloaded `CONFLICT` code on the backend
  (add `EMAIL_ALREADY_EXISTS`) or working around it in the mobile resolver? The
  backend change is cleaner but touches the api-contract.

```
Status: DONE_WITH_CONCERNS
Summary: 1 High (CONFLICT→emailTaken mislabel shown on scan-confirm 409), 5 Medium (raw-English error leak, stale pantry-match after cook, silent shopping add/toggle failures, leaked chat typing timers, swallowed image-send error), 4 Low. No Critical, no token exposure; money is clean integer-VND throughout.
Concerns/Blockers: H1 is user-visible today on the scan-review screen and should be fixed before ship; it also depends on a backend decision about the overloaded CONFLICT code.
```
