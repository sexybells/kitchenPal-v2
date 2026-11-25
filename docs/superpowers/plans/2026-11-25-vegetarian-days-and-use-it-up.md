# Vegetarian Days + Use-It-Up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rank suggestions by expiring pantry items and by lunar vegetarian days, show it on the home screen, and send one localized 16:00 push per user per day.

**Architecture:** A pure Vietnamese lunar calendar util plus a `DayContextService` give every caller the same "today" (user time zone, lunar date, vegetarian flags). `RecipeSelectionService` gains expiry-aware matching and a 4-level order; suggestions, meal auto-fill and a new `reminders` module (the app's first BullMQ job scheduler) all consume it. Mobile reads the new response fields; it never computes lunar dates.

**Tech Stack:** NestJS 11, Mongoose, BullMQ (`@nestjs/bullmq`), zod (`@kitchenpal/api-contract`, vitest), Expo + TanStack Query + jest-expo.

**Spec:** `docs/superpowers/specs/2026-11-25-vegetarian-days-and-use-it-up-design.md` — read it before any task.

## Global Constraints

- Lunar calendar: Hồ Ngọc Đức algorithm, **time zone fixed at 7**. No Chinese-calendar library.
- Vegetarian day = lunar day `1` or `15`; leap months count.
- At-risk item: `stockState !== "out"` and `now < expiryDate ≤ now + 3 days`. `AT_RISK_DAYS = 3`, with a comment pointing at `apps/mobile/src/features/pantry/stock.ts` `expiryInfo`.
- `observesVegetarianDays` default `false`. `timeZone` default `"Asia/Ho_Chi_Minh"`. Invalid stored zone → fall back + `logger.warn`.
- Vegetarian priority **reorders, never filters**.
- Background job never calls AI (`useAi: false`).
- `REMINDER_HOUR = 16` local; at most one reminder push per user per local date; reminder pushes never send email.
- Push copy localized by `user_settings.locale` (`vi` | `en`). New user-facing mobile strings go in both `src/i18n/locales/vi.ts` and `en.ts`.
- Design tokens only (no hex). Conventional Commits. `pnpm lint`, `pnpm typecheck`, `pnpm test` stay green after every task.
- Don't localize the existing English pushes (chat/budget/invite) — out of scope.

## Review Focus

1. **Lunar month end:** on the last day of a 29-day lunar month, "is tomorrow vegetarian?" must say yes (tomorrow is mùng 1). Never compute tomorrow as `lunar.day + 1`. → Task 1 test `tomorrow of 2027-02-05 is lunar 1/1`.
2. **Expiry exactly at the boundary:** an item with `expiryDate === now` is expired (excluded). An item at `now + 3 days` exactly is at-risk. → Task 4 tests.
3. **Same name, two pantry entries:** the expiring entry must win the match. → Task 4 test.
4. **Household of two, both opted in:** each member gets their own push. Dedupe is per user, not per household. → Task 7 test.
5. **Travelling user / stale zone:** a garbage stored `timeZone` must not crash the tick or the suggestions call. It falls back to `Asia/Ho_Chi_Minh`. → Task 5 test (suggestions), Task 7 test (tick).

---

### Task 1: Vietnamese lunar calendar + local date utils

**Files:**
- Create: `apps/backend/src/common/calendar/vietnamese-lunar.ts`
- Create: `apps/backend/src/common/calendar/local-date.ts`
- Test: `apps/backend/src/common/calendar/vietnamese-lunar.spec.ts`, `apps/backend/src/common/calendar/local-date.spec.ts`

**Interfaces:**
- Produces:
  - `interface SolarDate { year: number; month: number; day: number }`
  - `interface LunarDate { year: number; month: number; day: number; isLeapMonth: boolean }`
  - `toLunarDate(date: SolarDate): LunarDate`
  - `isVegetarianLunarDay(lunar: LunarDate): boolean`
  - `addDays(date: SolarDate, days: number): SolarDate`
  - `localDateIn(timeZone: string, at: Date): SolarDate` (uses `Intl.DateTimeFormat(..., { timeZone })`)
  - `localHourIn(timeZone: string, at: Date): number` (0–23)
  - `isValidTimeZone(value: string): boolean`
  - `formatSolarDate(date: SolarDate): string` → `"YYYY-MM-DD"`

- [ ] **Step 1: Look up and verify the test vectors** against a published Vietnamese lunar calendar (e.g. lichvn / Hồ Ngọc Đức's tables). Don't take them from memory. Expected values to confirm:
  `2026-02-17 → 1/1/2026` · `2026-03-03 → 15/1/2026` · `2027-02-06 → 1/1/2027` · `2027-02-05 → last day of month 12` · `1985-01-21 → 1/1/1985` (the Chinese calendar has 1985-02-20) · one date inside leap month 6 of 2025 → `isLeapMonth: true`.
- [ ] **Step 2: Write failing tests:**
  - `it("converts Tết Bính Ngọ")`: `expect(toLunarDate({year:2026,month:2,day:17})).toEqual({year:2026,month:1,day:1,isLeapMonth:false})`
  - `it("uses UTC+7 not UTC+8 (Tết 1985)")`: `toLunarDate({1985,1,21}).day === 1 && month === 1`
  - `it("flags leap month 6 of 2025")`
  - `it("tomorrow of 2027-02-05 is lunar 1/1")`: `isVegetarianLunarDay(toLunarDate(addDays({2027,2,5},1))) === true`
  - `it("1 and 15 are vegetarian, 14 and 16 are not")`
  - `local-date.spec`: `localDateIn("Asia/Ho_Chi_Minh", new Date("2026-12-03T17:30:00Z"))` → `{2026,12,4}`; `localHourIn("Asia/Ho_Chi_Minh", new Date("2026-12-04T09:00:00Z")) === 16`; `isValidTimeZone("Mars/Base") === false`; `addDays({2026,12,31},1)` → `{2027,1,1}`.
- [ ] **Step 3: Run** `pnpm --filter @kitchenpal/backend test -- common/calendar`. Expected: FAIL (modules missing).
- [ ] **Step 4: Implement.** Port Hồ Ngọc Đức's `jdFromDate`, `getNewMoonDay`, `getSunLongitude`, `getLunarMonth11`, `getLeapMonthOffset`, `convertSolar2Lunar` with `timeZone = 7` as a module constant. Keep it a pure function, and credit the algorithm's source in the header comment.
- [ ] **Step 5: Run** the same command. Expected: PASS.
- [ ] **Step 6: Commit** `feat(backend): add Vietnamese lunar calendar and local date utils`

### Task 2: Contract additions

**Files:**
- Modify: `packages/api-contract/src/users.ts`, `packages/api-contract/src/recipes.ts`, `packages/api-contract/src/notification.ts`
- Test: `packages/api-contract/src/__tests__/recipes-contract.test.ts`, create `packages/api-contract/src/__tests__/users-notification-contract.test.ts`

**Interfaces:**
- Produces:
  - `timeZoneSchema` (string, refined with the same `Intl` check as Task 1, duplicated in the contract because the contract cannot import backend code). `userSettingsResponseSchema` adds `observesVegetarianDays: z.boolean()` and `timeZone: z.string()`. `updateSettingsSchema` adds both as optional (`timeZone: timeZoneSchema`).
  - `recipeSuggestionSchema` adds `rescues: z.array(z.object({ name: z.string(), expiryDate: z.string() }))` and `isVegetarian: z.boolean()`.
  - `suggestionDaySchema = { date: string, lunar: { day, month, year: number, isLeapMonth: boolean }, vegetarianDay: boolean, vegetarianPriority: boolean }`. `suggestionsResponseSchema` adds `day: suggestionDaySchema`. Exported types `SuggestionDay`, `SuggestionRescue`.
  - `notificationTypeSchema` adds `"vegetarian_day"`.

- [ ] **Step 1: Write failing tests:** `updateSettingsSchema` rejects `{ timeZone: "Mars/Base" }` and accepts `{ timeZone: "Europe/Berlin", observesVegetarianDays: true }`. `suggestionsResponseSchema` parses a sample with `rescues`/`isVegetarian`/`day`, and rejects one missing `day`. `notificationTypeSchema.parse("vegetarian_day")` succeeds.
- [ ] **Step 2: Run** `pnpm --filter @kitchenpal/api-contract test`. Expected: FAIL.
- [ ] **Step 3: Implement** the schema changes above.
- [ ] **Step 4: Run** the contract tests, then `pnpm typecheck`. Expected: contract PASS. Typecheck errors are allowed only in the backend `buildSuggestions` and `UsersService` projections and in mobile places that construct these types; list them for Tasks 3/5. Don't fix them here except with the narrowest stubs needed to keep the build green: `rescues: []`, `isVegetarian: false`, a `day` built by a `placeholderDay()` that Task 5 deletes.
- [ ] **Step 5: Commit** `feat(contract): add vegetarian-day, rescue and time zone fields`

### Task 3: Backend settings fields

**Files:**
- Modify: `apps/backend/src/modules/users/schemas/user-settings.schema.ts`, `apps/backend/src/modules/users/users.service.ts`
- Test: `apps/backend/test/platform.e2e-spec.ts` (or wherever `PATCH /users/settings` is already covered; grep `users/settings`)

**Interfaces:**
- Consumes: Task 2 schemas.
- Produces: `UserSettings.observesVegetarianDays: boolean` (`@Prop({ default: false })`) and `UserSettings.timeZone: string` (`@Prop({ default: "Asia/Ho_Chi_Minh" })`), both projected by `GET /users/settings` and updatable by `PATCH /users/settings`.

- [ ] **Step 1: Write failing e2e test** `it("stores observesVegetarianDays and timeZone")`. A fresh user `GET` returns `false` / `"Asia/Ho_Chi_Minh"`. `PATCH { observesVegetarianDays: true, timeZone: "Europe/Berlin" }` round-trips. `PATCH { timeZone: "Mars/Base" }` → 400.
- [ ] **Step 2: Run** `pnpm --filter @kitchenpal/backend test -- <that file>`. Expected: FAIL.
- [ ] **Step 3: Implement** the props plus the projection/merge in `UsersService`, following the existing `notifications` merge pattern.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(users): store vegetarian-day opt-in and time zone`

### Task 4: Expiry-aware matching and ranking

**Files:**
- Modify: `apps/backend/src/modules/recipes/services/pantry-match.ts`, `apps/backend/src/modules/recipes/services/recipe-selection.service.ts`, `apps/backend/src/modules/recipes/ai/recipe-ai.service.ts` (`RankCandidate` only)
- Create: `apps/backend/src/modules/recipes/services/rescue.ts`
- Test: `apps/backend/src/modules/recipes/services/pantry-match.spec.ts`, create `apps/backend/src/modules/recipes/services/rescue.spec.ts`, create `apps/backend/src/modules/recipes/services/recipe-selection.service.spec.ts`

**Interfaces:**
- Produces:
  - `PantryStockLike` adds `expiryDate: Date | null`.
  - `matchIngredients`: same signature. Stock is sorted by `expiryDate` ascending (null last) before matching.
  - `rescue.ts`: `AT_RISK_DAYS = 3`. `isAtRisk(item: PantryStockLike, now: Date): boolean`. `interface Rescue { pantryItemId: string; name: string; expiryDate: Date }`. `findRescues(match: PantryMatchResult, stock: PantryStockLike[], now: Date): Rescue[]` (counts only non-optional matched ingredients, deduped by `pantryItemId`).
  - `interface SelectionContext { now: Date; vegetarianDay: boolean }`. Here `vegetarianDay` already means "priority applies" (the caller ANDs in the opt-in).
  - `RankedRecipe` adds `rescues: Rescue[]` and `isVegetarian: boolean` (tag `chay` present, case-insensitive).
  - `select(scope, { mealType?, operation, goal, userId, context: SelectionContext, useAi?: boolean })`. `useAi` defaults to `true`; `false` skips `ai.rank` and reports `{ provider: "none", degraded: true }`.
  - `RankCandidate` adds `rescueCount: number` and `isVegetarian: boolean`.

- [ ] **Step 1: Write failing tests**
  - pantry-match: `it("links an ingredient to the soonest-expiring of two same-name items")`. Two `cà chua` entries: fresh one first in the array, the other expiring in 1 day → `pantryItemId` is the expiring one. Also `matchScore` and the available count are unchanged versus the unsorted input.
  - rescue: `isAtRisk` is false when `expiryDate === now`, true at `now + 3d` exactly, false at `now + 3d + 1ms`, false for `stockState: "out"`, false for `null`. `findRescues` ignores an at-risk item matched only by an optional ingredient.
  - selection (mock repositories + `RecipeAiService`): heuristic order is vegetarian partition → `rescues.length` → `matchScore` → `averageRating`. With `vegetarianDay: true`, a non-`chay` recipe is still present, just after the `chay` ones. With a mocked AI order that puts a meat dish first on a vegetarian day, the output has the `chay` dishes first and keeps the AI order inside each group. With `useAi: false`, `ai.rank` is not called.
- [ ] **Step 2: Run** `pnpm --filter @kitchenpal/backend test -- recipes/services`. Expected: FAIL.
- [ ] **Step 3: Implement.** `pantryStock()` maps `expiryDate`. Pass `rescueCount`/`isVegetarian` to `ai.rank`. Append the goal clauses from spec §3 (the vegetarian clause only when `context.vegetarianDay`). Re-apply the vegetarian partition after `orderBy` as a stable partition. Update the existing `select()` callers (`buildSuggestions`, `autoFill`) to pass `context: { now: new Date(), vegetarianDay: false }` for now (Tasks 5/6 replace this).
- [ ] **Step 4: Run** the tests and `pnpm --filter @kitchenpal/backend test -- recipes`. Expected: PASS, and the existing recipes e2e is still green.
- [ ] **Step 5: Commit** `feat(recipes): rank suggestions by expiring pantry items and vegetarian days`

### Task 5: Day context + suggestions response

**Files:**
- Create: `apps/backend/src/modules/recipes/services/day-context.service.ts`
- Modify: `apps/backend/src/modules/recipes/services/recipes.service.ts` (`buildSuggestions`), `apps/backend/src/modules/recipes/recipes.module.ts`
- Test: create `apps/backend/src/modules/recipes/services/day-context.service.spec.ts`, modify `apps/backend/test/recipes.e2e-spec.ts`

**Interfaces:**
- Consumes: Task 1 utils, Task 3 settings, Task 4 `SelectionContext`/`Rescue`.
- Produces: `DayContextService.forUser(userId: string, at: Date): Promise<DayContext>` where `DayContext = SuggestionDay & { timeZone: string; solar: SolarDate }`. It reads settings in personal scope; an invalid or missing zone → `"Asia/Ho_Chi_Minh"` + warn. Exported from the module (Tasks 6/7 use it). Also `toSelectionContext(day: DayContext, now: Date): SelectionContext` → `{ now, vegetarianDay: day.vegetarianPriority }`.

- [ ] **Step 1: Write failing tests**
  - unit: a user with `timeZone: "Mars/Base"` stored (write it straight to the model, bypassing validation) → `timeZone === "Asia/Ho_Chi_Minh"`, no throw. `at = 2026-03-03T03:00:00Z`, opted-in → `vegetarianDay && vegetarianPriority`. Same date, not opted in → `vegetarianDay === true, vegetarianPriority === false`.
  - e2e `it("returns rescues and the day block")`: seed a pantry item `cà chua` expiring in 1 day and a recipe using it as required → that suggestion has `rescues[0].name === "cà chua"`, and the body has `day.date` in `YYYY-MM-DD` format. Existing test `"returns heuristic suggestions..."` stays green.
- [ ] **Step 2: Run** `pnpm --filter @kitchenpal/backend test -- day-context recipes.e2e`. Expected: FAIL.
- [ ] **Step 3: Implement.** In `buildSuggestions`: `const day = await this.dayContext.forUser(scope.userId, now)`, pass `toSelectionContext(day, now)`, map `rescues` to `{ name, expiryDate: iso }`, set `isVegetarian`, return `day` (only the `SuggestionDay` fields). Delete Task 2's `placeholderDay()`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(recipes): return the lunar day and rescued items with suggestions`

### Task 6: Meal auto-fill vegetarian slots

**Files:**
- Modify: `apps/backend/src/modules/recipes/services/meal-plans.service.ts` (`autoFill`, around line 131)
- Test: `apps/backend/test/recipes.e2e-spec.ts` (auto-fill block)

**Interfaces:**
- Consumes: `DayContextService`, Task 1 `toLunarDate`/`addDays`/`isVegetarianLunarDay`, `RankedRecipe.isVegetarian`.
- Produces: no new API. Behavior per spec §4: still one `select()` per meal type. For each target slot, `slotDate = addDays(weekStart, dayOfWeek)`. If the user opted in and that date is a vegetarian lunar day, take the next **unused `chay`** candidate. When there are none, fall back to the existing cycle.

- [ ] **Step 1: Write failing e2e test** `it("fills lunar-15 slots with vegetarian recipes for opted-in users")`. Use a plan whose week contains 2026-03-03 (15/1), a mix of `chay` and meat recipes, and an opted-in user → the slot on that day holds a `chay` recipe and other days are unchanged in kind. When the same user is not opted in, the ordering is unaffected.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Keep the entries as `RankedRecipe` (not only `doc`) in `rankedByMeal`. Pass `context` with `vegetarianDay: false` to `select()` (week-level ranking); vegetarian handling is per slot only.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(meal-plans): give lunar vegetarian days vegetarian slots on auto-fill`

### Task 7: Reminders module (16:00 push)

**Files:**
- Create: `apps/backend/src/modules/reminders/reminders.module.ts`, `reminder-scheduler.service.ts` (registers the job scheduler), `reminder-tick.processor.ts` (BullMQ `WorkerHost`), `reminder-tick.service.ts` (the logic, callable directly), `reminder-composer.ts` (pure: decides kind + copy), `reminder-copy.ts` (vi/en templates + `lunarDayLabel`), `schemas/reminder-delivery.schema.ts`, `repositories/reminder-delivery.repository.ts`
- Modify: `apps/backend/src/modules/household/services/notification.service.ts` (`CHANNELS` adds `vegetarian_day: { push: true, email: false }`), `apps/backend/src/modules/household/schemas/notification.schema.ts` (enum), `apps/backend/src/app.module.ts`, `apps/backend/src/modules/household/repositories/household-member.repository.ts` (add `latestActiveForUser(userId)` if the existing query at line ~62 doesn't sort), `docs/deployment.md` (one paragraph: the reminder scheduler needs Redis and runs hourly)
- Test: `reminder-composer.spec.ts`, `reminder-copy.spec.ts`, `reminder-tick.service.spec.ts` (next to the sources)

**Interfaces:**
- Consumes: `DayContextService`, `RecipeSelectionService.select(..., useAi: false)`, `NotificationService.notify`, `UserSettingsRepository`, `UserRepository` (`suspendedAt`), household member repo.
- Produces:
  - Queue `"meal-reminders"`, scheduler id `"meal-reminders-tick"`, pattern `"0 * * * *"`. Not registered when `NODE_ENV === "test"`.
  - `REMINDER_HOUR = 16`.
  - `ReminderDelivery { userId: string; localDate: string; kind: "vegetarian_day" | "expiry_alert" }`. Unique index `(userId, localDate)`. TTL index on `createdAt`, 30 days.
  - `composeReminder(input: { locale: Locale; tomorrowLunar: LunarDate | null /* set only when opted in and tomorrow is a veg day */; vegetarianPick: { name: string } | null; rescuePick: { recipeId: string; name: string; items: string[] } | null }): { type: "vegetarian_day" | "expiry_alert"; payload: Record<string, unknown>; push: { title: string; body: string } } | null`
  - `ReminderTickService.run(at: Date): Promise<{ considered: number; sent: number }>`

- [ ] **Step 1: Write failing tests**
  - copy: `vi` vegetarian with dish → title `"Mai là rằm tháng Giêng"` and body containing the dish. Lunar day 1 → `"mùng 1"`. Without a dish → body `"Nhớ chuẩn bị đồ chay, đi chợ chiều nay nhé."`. `vi` expiry → title `"Tối nay nấu {món}?"`, body `"Dùng hết {a}, {b} trước khi hỏng."`. `en` variants present. Month labels: 1 → `"tháng Giêng"`, 12 → `"tháng Chạp"`, leap → suffix `" nhuận"`.
  - composer: vegetarian beats rescue. Rescue-only → `expiry_alert` with payload `{ recipeId, recipeName, items }`. Both null → `null`.
  - tick (mocked deps, `at = 2026-12-04T09:00:00Z`): a user in `Asia/Ho_Chi_Minh` is considered and a user in `Europe/Berlin` is not. A user with `mealReminders: false`, no push tokens, or `suspendedAt` set is skipped. Running `run(at)` twice sends once (the duplicate-key claim is swallowed). Two household members both opted in → two sends. One user's `notify` throwing doesn't stop the next. A stored `timeZone: "Mars/Base"` is treated as `Asia/Ho_Chi_Minh`. `notify` is called with `delivery.push` only (no `email`). On a vegetarian day with only meat rescue candidates → no rescue send.
- [ ] **Step 2: Run** `pnpm --filter @kitchenpal/backend test -- modules/reminders`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Tick: page through settings where `notifications.push && notifications.mealReminders && pushTokens.0 exists`, then filter `localHourIn(zone, at) === REMINDER_HOUR`.
  - Scope: `latestActiveForUser` → household scope, else personal.
  - Picks:
    - vegetarian pick: `select` with `context { now: tomorrow 11:00 local, vegetarianDay: true }`, then the first `isVegetarian`.
    - rescue pick: `select` for now, then the first with `rescues.length ≥ 1`, restricted to `isVegetarian` when today has priority.
  - Claim `ReminderDelivery` **before** `notify`. Log `{ considered, sent }`.
  - `upsertJobScheduler` failure at boot (e.g. no Redis in dev) is caught and logged with `logger.warn`. It never crashes bootstrap; HTTP keeps serving (spec "Lỗi & biên").
- [ ] **Step 4: Run.** Expected: PASS. Then run the full backend suite: `pnpm --filter @kitchenpal/backend test`.
- [ ] **Step 5: Commit** `feat(reminders): send a daily 16:00 vegetarian-day or use-it-up push`

### Task 8: Mobile settings — API, time zone sync, toggles

**Files:**
- Modify: `apps/mobile/src/api/users.ts` (`getSettings`, `updateSettings`), `apps/mobile/app/settings.tsx`, `apps/mobile/app/_layout.tsx` (mount the sync hook next to `usePushNotifications()`), `apps/mobile/src/i18n/locales/vi.ts`, `en.ts`
- Create: `apps/mobile/src/features/settings/hooks.ts` (`useSettings`, `useUpdateSettings`, `useTimeZoneSync`)
- Test: create `apps/mobile/src/features/settings/__tests__/settings.test.tsx`

**Interfaces:**
- Consumes: `GET`/`PATCH users/settings` (Task 3).
- Produces: `useTimeZoneSync()`. When authenticated, it reads `getCalendars()[0]?.timeZone` from `expo-localization` and PATCHes only if the value differs from `settings.timeZone`. Settings screen gets a "Thông báo" card with two switch rows: `settings.vegetarianDays` → `observesVegetarianDays`, and `settings.mealReminders` → `notifications.mealReminders`.

- [ ] **Step 1: Write failing tests:** toggling the vegetarian row calls `updateSettings({ observesVegetarianDays: true })`. Toggling meal reminders calls `updateSettings({ notifications: { mealReminders: false } })`. `useTimeZoneSync` with the device on `Asia/Ho_Chi_Minh` and the server on the same → no PATCH. Server on `Europe/Berlin` → PATCH `{ timeZone: "Asia/Ho_Chi_Minh" }`.
- [ ] **Step 2: Run** `pnpm --filter @kitchenpal/mobile test -- settings`. Expected: FAIL.
- [ ] **Step 3: Implement.** Copy: `vi` `"Ăn chay mùng 1 & rằm"` / `"Gợi ý bữa ăn lúc 16h"`. `en` `"Vegetarian on lunar 1st & 15th"` / `"Meal ideas at 4 pm"`. Add a switch row with UI-kit components, or `ListRow` + RN `Switch` themed from tokens if the kit has none.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(mobile): add vegetarian-day and meal-reminder settings with time zone sync`

### Task 9: Mobile home — day label and chips

**Files:**
- Modify: `apps/mobile/app/(tabs)/index.tsx` (suggestions section, ~line 194), `apps/mobile/src/i18n/locales/vi.ts`, `en.ts`
- Create: `apps/mobile/src/features/recipes/lunar-label.ts` (`lunarDayLabel(t, lunar)`), `apps/mobile/src/features/recipes/rescue-label.ts` (`rescueChipText(t, names, max = 2)`)
- Test: `apps/mobile/src/features/recipes/__tests__/home-sections.test.tsx`

**Interfaces:**
- Consumes: `SuggestionsResponse.day`, `RecipeSuggestion.rescues`/`isVegetarian` (Task 2).
- Produces: UI only, per spec §5.

- [ ] **Step 1: Write failing tests:** `day.vegetarianPriority: true, lunar {15,10}` → text `"Hôm nay rằm tháng 10 · ưu tiên món chay"` (testID `home-veg-day`). `vegetarianDay: true, vegetarianPriority: false` → no `home-veg-day`. Rescues `["cà chua","đậu bắp","hành"]` → chip `"Dùng hết: cà chua, đậu bắp +1"`. `isVegetarian` → chip `"Chay"`. Lunar month 1 → `"tháng Giêng"`, 12 → `"tháng Chạp"`, leap → `"nhuận"`.
- [ ] **Step 2: Run** `pnpm --filter @kitchenpal/mobile test -- home-sections`. Expected: FAIL.
- [ ] **Step 3: Implement.** The rescue chip uses tone `warning`. Use `Badge`/`Chip` from the UI kit.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(mobile): show the lunar day and use-it-up chips on home suggestions`

### Task 10: Mobile push routing fix + new types

**Files:**
- Modify: `apps/mobile/src/features/notifications/push.ts` (`routeForPushResponse`), `apps/mobile/src/features/notifications/labels.ts` (`notificationRoute`, label map), `apps/mobile/src/i18n/locales/vi.ts`, `en.ts`
- Test: `apps/mobile/src/features/notifications/__tests__/notifications.test.tsx`

**Interfaces:**
- Consumes: the backend push `data` shape, which is `{ type, ...payload }` (`notification.service.ts` `fanOut`). It is **not** a full `NotificationResponse`.
- Produces: `routeForPushResponse` parses `data` with `notificationTypeSchema` on `data.type` and treats the remaining keys as `payload`, then calls `notificationRoute`. Today it validates against `notificationResponseSchema`, which requires `id`/`readAt`/`createdAt`, so every push tap returns `null`. `notificationRoute`: `expiry_alert` with `payload.recipeId` → `/recipe?id=…`, otherwise `/pantry`; `vegetarian_day` → `/` (home). Label `vegetarian_day`: icon `leaf` (or the closest existing icon), tone `success`, key `notifications.type.vegetarianDay`.

- [ ] **Step 1: Write failing tests:** a push response with `data = { type: "chat_message", householdId: "h1" }` → `{ pathname: "/chat", params: { householdId: "h1" } }` (proves the fix for existing types). `{ type: "expiry_alert", recipeId: "r1" }` → `"/recipe?id=r1"`. `{ type: "expiry_alert" }` → `"/pantry"`. `{ type: "vegetarian_day" }` → `"/"`. `{ type: "bogus" }` → `null`.
- [ ] **Step 2: Run** `pnpm --filter @kitchenpal/mobile test -- notifications`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests, then the whole workspace: `pnpm lint && pnpm typecheck && pnpm test`. Expected: all green.
- [ ] **Step 5: Commit** `fix(mobile): route push taps from the real payload shape and add vegetarian_day`
