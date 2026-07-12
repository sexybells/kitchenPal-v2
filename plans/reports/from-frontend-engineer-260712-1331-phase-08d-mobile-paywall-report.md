# Phase 8d — Mobile Paywall / Subscription screen (frontend)

Scope: `apps/mobile/**` only. Backend/admin/packages untouched.

## What shipped

### API + data layer
- `apps/mobile/src/api/subscriptions.ts` — envelope+zod client wrappers:
  `listPlans` (`GET /subscriptions/plans`, unwraps `{ plans }`), `mine`
  (`GET /subscriptions/me`), `activate` (`POST /subscriptions/me/activate`,
  INERT), `cancel` (`POST /subscriptions/me/cancel`). Schemas come from
  `@kitchenpal/api-contract` `subscription.ts`.
- `apps/mobile/src/features/subscription/hooks.ts` — react-query hooks:
  `usePlans`, `useMySubscription`, `useRequestActivation` (mutation), and
  `useCancelSubscription` (mutation that invalidates the `mine` query on
  success). Centralised `subscriptionKeys`.

### UI
- `apps/mobile/src/features/subscription/PlanCard.tsx` — one tier: name, price
  (VND via existing `formatVnd`, or the localized "Free" label for a 0 price),
  feature list with check icons. Recommended plan gets a 2px primary border +
  a "Recommended" badge; the caller's current tier gets a "Current" badge.
- `apps/mobile/src/features/subscription/ContactSheet.tsx` — bottom-sheet
  `Modal` (matches the existing `RecipePicker` pattern) shown after the inert
  upgrade request, spelling out that Pro is granted manually and no payment is
  taken.
- `apps/mobile/app/paywall.tsx` — replaced the placeholder. Loading / error
  (with retry) / success states; plans sorted cheapest-first; current-plan
  indicator line; Pro-user gets a real cancel action, Free-user gets the inert
  upgrade CTA + contact sheet.
- `apps/mobile/app/settings.tsx` — added a "Subscription" row (icon `sparkles`)
  that shows the current plan as a badge (Pro→primary, Free→neutral) and
  deep-links to `/paywall`. Home-menu Pro banner already routed to `/paywall`
  (unchanged, still valid).
- i18n: added a `paywall` block to `src/i18n/locales/vi.ts` (source-of-truth
  type) and `en.ts` (parallel keys).

## Current-plan handling
`GET /subscriptions/me` returns `{ tier, subscription }`. `tier` drives:
- Header line: `paywall.currentPro` ("Bạn đang dùng Pro" / "You're on Pro") when
  `tier==="pro"`, else `paywall.currentFree` ("Gói hiện tại: Miễn phí" /
  "Current plan: Free").
- Per-card "Current" badge when `plan.tier === tier`.
- Action area: Pro → cancel button; Free → inert upgrade CTA.
- Settings badge mirrors the tier.

## Inert CTA wording (no purchase implied)
- Button label — vi: **"Liên hệ để nâng cấp"**, en: **"Contact us to upgrade"**.
- Sub-note — vi: "Chưa hỗ trợ thanh toán trong ứng dụng — gói Pro được cấp thủ
  công.", en: "In-app payment isn't available yet — Pro is granted manually."
- Contact sheet body — vi: "Việc nâng cấp Pro hiện được xử lý thủ công. Hãy liên
  hệ đội ngũ KitchenPal để được cấp gói Pro — không có khoản thanh toán nào diễn
  ra trong ứng dụng.", en: "Upgrading to Pro is handled manually for now. Reach
  out to the KitchenPal team to be granted Pro — no payment is taken in the app."
- The CTA calls `activate` (returns `contact_required`); its server `message` is
  intentionally ignored in favour of localized copy. Cancel is a real opt-out.

## Tests
`apps/mobile/src/features/subscription/__tests__/paywall.test.tsx` (hermetic,
mocks `subscriptionsApi`): (1) renders both tiers with VND prices
("49.000 ₫" / "Free"), feature lists, the current-plan indicator, current +
recommended badges; (2) upgrade CTA is inert — asserts the label is the contact
wording, that no buy/purchase/checkout/pay wording exists, that `activate` is
called with the Pro plan id, and that the contact sheet with the "no payment is
taken" copy appears; (3) Pro user sees no upgrade CTA, cancel calls the cancel
endpoint and surfaces the downgrade confirmation.

## Resume fix
The run was interrupted; the one failing assertion was `getByText("Recommended")`
— the shared `Badge` uppercases its label, so the text was "RECOMMENDED". Fixed
by giving the recommended `Badge` a `testID` (consistent with the existing
"current" badge) and asserting `getByTestId("paywall-plan-pro-recommended")`.
Coverage unchanged.

## Verification (actual output)
- `pnpm --filter @kitchenpal/mobile lint` → `LINT_EXIT=0`
- `pnpm --filter @kitchenpal/mobile typecheck` → `TYPECHECK_EXIT=0`
- `pnpm --filter @kitchenpal/mobile test` → `Test Suites: 27 passed, 27 total` /
  `Tests: 81 passed, 81 total` (was 78; +3 paywall)
- `pnpm --filter @kitchenpal/mobile build` (expo export) → `BUILD_EXIT=0`,
  `Exported: dist`, includes `/paywall (19KB)` and `/settings (19KB)`
- Root `pnpm build` → `Tasks: 5 successful, 5 total`
- Root `pnpm lint` → `Tasks: 7 successful, 7 total`
- Root `pnpm typecheck` → `Tasks: 7 successful, 7 total`
- Root `pnpm test` → `Tasks: 7 successful, 7 total` (FULL TURBO — other apps
  cached/untouched)

## Deviations / notes
- Price shown without a billing period. The contract has no interval field, so
  claiming "/month" would be unverified; the raw VND amount avoids asserting a
  wrong period. Flag if a period label is desired.
- No new dependencies added.

## Unresolved questions
- Should the Pro price display a billing period (e.g. "/tháng")? Needs a
  period/interval on the plan contract to be accurate.
- `activate`'s server `message` is currently unused (localized copy preferred).
  Confirm that's the intended UX vs. surfacing server-provided contact details.

Status: DONE
Summary: Built the mobile Paywall (Free/Pro tiers, VND prices, current-plan
indicator, inert "contact to upgrade" CTA + contact sheet, real Pro cancel) and
wired it into Home-menu + Settings; fixed the one interrupted test. All mobile
and workspace gates green (mobile 81 tests, expo export includes /paywall).
Concerns/Blockers: none blocking; two product questions (price period label,
use of server activate message) flagged above.
