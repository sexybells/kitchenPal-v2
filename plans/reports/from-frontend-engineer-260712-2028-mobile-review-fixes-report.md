# Mobile Review Fixes — Report

Scope: `apps/mobile/**` only. Applied the consolidated code-reviewer findings (H1, M1–M5, plus low L1/L2).

## Changes

### H1 + M1 — error resolver (`src/lib/error-message.ts`)
- `CONFLICT` no longer maps to `emailTaken`. `EMAIL_ALREADY_EXISTS`/`EMAIL_IN_USE` → `errors.emailTaken`; plain `CONFLICT` → new generic `errors.conflict`.
- Added mappings for every backend `ErrorCode`: `OPTIMISTIC_LOCK_CONFLICT` → `errors.staleWrite`, `FORBIDDEN` → `errors.forbidden`, `NOT_FOUND` → `errors.notFound`, `SERVICE_UNAVAILABLE` → `errors.unavailable`, `RATE_LIMIT_EXCEEDED` → `errors.rateLimited`, `UNAUTHORIZED` → `errors.sessionExpired`, `INTERNAL_SERVER_ERROR` → `errors.server`.
- Unmapped-code fallback now returns `t("errors.server")` (localized) instead of the raw English server string.
- Added 5 new vi+en strings: `conflict`, `staleWrite`, `forbidden`, `notFound`, `unavailable` (`src/i18n/locales/vi.ts`, `en.ts`).

### M2 — stale pantry-match after cook (`src/features/pantry/hooks.ts`)
- `useCook.onSuccess` now also invalidates the recipe pantry-match query family (predicate on `["recipes","pantry-match", …]`) alongside `["pantry"]`. Covers cook from both the recipe detail screen and the cook screen since cooking consumes pantry items globally.

### M3 — silent shopping errors (`app/(tabs)/shopping.tsx`)
- Renders `addItem.error` (localized) under the add button (`shopping-add-error`).
- Renders a localized banner for `toggle.error`/`remove.error` 409s (`shopping-mutation-error`) in addition to the existing rollback+refetch.
- Row `disabled` guard now includes `addItem.isPending` so a toggle racing an in-flight add can't fire on a stale version.

### M4 — chat typing timer leak (`src/features/chat/hooks.ts`)
- Added a per-user `Map<userId, timeoutId>` ref. Each `typing` signal clears the peer's existing timer before scheduling a new one; effect cleanup clears all timers and empties the map on unmount. Fixes leaked timers and early clears of still-typing peers.

### M5 — swallowed chat image-send error (`app/chat.tsx`)
- Surfaces `sendImage.error` (localized) via `chat-image-error`.

### Low
- L1 (`src/features/notifications/hooks.ts`): `useMarkAllRead` uses `Promise.allSettled` + `onSettled` invalidation so a single failed mark no longer aborts the list refresh.
- L2 (`src/features/chat/hooks.ts` + `app/chat.tsx`): vote-cast failures now set `channel.actionError`, surfaced via `chat-action-error`.

## Tests added
- `src/lib/__tests__/error-message.test.ts` — locks `EMAIL_ALREADY_EXISTS`→email vs `CONFLICT`→generic, `OPTIMISTIC_LOCK_CONFLICT`→staleWrite, unmapped code → localized (never raw English), other backend codes localized.
- `src/features/pantry/__tests__/cook-invalidation.test.tsx` — cook marks the recipe pantry-match query invalidated.
- `src/features/shopping/__tests__/shopping-list.test.tsx` — new case: add-item failure surfaces localized text, raw server string suppressed.
- `src/features/chat/__tests__/typing-timers.test.tsx` — typing timer cleared on unmount; repeat signal resets (clears) the prior timer.

## Verification (actual output)
- `pnpm --filter @kitchenpal/mobile typecheck` → exit 0.
- `pnpm --filter @kitchenpal/mobile lint` → exit 0.
- `pnpm --filter @kitchenpal/mobile test` → exit 0. Test Suites: 32 passed; Tests: 94 passed (was 81).
- `pnpm --filter @kitchenpal/mobile build` (expo export web) → exit 0, `Exported: dist`.
- Root `pnpm build` → 5/5 tasks successful. `pnpm lint` → 0. `pnpm typecheck` → 0. `pnpm test` → 7/7 tasks; backend 202 passed, mobile 94 passed.

## Notes / concerns
- The mobile Jest run still prints "A worker process has failed to exit gracefully … Active timers". Verified this is NOT from the chat typing timers anymore: running `chat-screen.test.tsx` and the two new chat/pantry tests with `--detectOpenHandles` produces no warning. The residual comes from a different pre-existing suite (a polling `refetchInterval`, e.g. scan-review), is non-fatal (test exit 0), and is outside this task's scope.
- New i18n strings keep vi+en key parity; no `any`; styling untouched (no new UI primitives, reused `Text` with theme colors).

Status: DONE
Summary: Applied H1, M1–M5 and low L1/L2 in `apps/mobile` with 13 new passing tests; mobile + root lint/typecheck/test/build all green (94 mobile tests, 202 backend).
Concerns/Blockers: Residual non-fatal Jest "active timers" teardown warning traced to a pre-existing polling suite, not the chat fix; left as-is (out of scope).
