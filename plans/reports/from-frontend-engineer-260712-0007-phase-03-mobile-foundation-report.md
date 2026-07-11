# Phase 03 — Mobile Foundation — Build Report

Agent: frontend-engineer · Date: 2026-07-12 · App: `apps/mobile` (`@kitchenpal/mobile`)
Scope respected: only `apps/mobile/**` created/edited. No root/workspace/other-package changes.

## Stack / SDK
- **Expo SDK 57** (`expo ~57.0.4`), **React 19.2.3**, **React Native 0.86.0**, New Architecture on.
- expo-router ~57.0.4, react-native-reanimated 4.5.0 (+ react-native-worklets 0.10.0), react-native-svg 15.15.4, safe-area-context 5.7, screens 4.25, gesture-handler 2.32.
- TanStack Query 5, Zustand 5, i18next 26 + react-i18next 17, expo-secure-store / expo-local-authentication / expo-localization (all SDK 57).
- Fonts: `@expo-google-fonts/plus-jakarta-sans` (400/500/600/700/800) loaded via `expo-font` useFonts.
- All deps added ONLY to `apps/mobile/package.json`; installed scoped. One extra devDep added: `@types/jest`.

## Monorepo / Metro — NO root change required
- `metro.config.js`: `watchFolders=[workspaceRoot]`, `resolver.nodeModulesPaths=[app, root]`, hierarchical lookup kept on. pnpm's default symlink linker resolved every `@kitchenpal/*` package — **no `.npmrc` / `node-linker=hoisted` / root edit needed.**
- `@kitchenpal/design-tokens` (ESM) and `@kitchenpal/api-contract` (dual ESM+CJS) both resolve and bundle. Verified by a successful `expo export` (26 routes) and jest (design-tokens transpiled via a pnpm-aware `transformIgnorePatterns`).
- Jest gotcha handled: pnpm nests packages under `.pnpm/…`, so the transformIgnorePatterns whitelist allows an optional `(?:.*\.pnpm/)?` prefix.

## Component library (`src/ui/*`) — all styling from `rnTheme`
Screen (safe-area scaffold + status bar + footer), Text (typed variant→textStyle), Button (primary/secondary/ghost, Reanimated press scale, loading), Input (label/error/secure toggle/left icon/focus), Chip, Card, Badge (6 tones from `-soft` tints), Toggle, Avatar (image/initials), ListRow (soft-tint icon circle — the ingredient line-icon rule), Fab (Reanimated spring), BottomNav (custom, center FAB), StateViews (Loading/Empty/Error), PlaceholderScreen, and a line-icon set `Icon.tsx` (24 icons incl. food `leaf`, 1.8 stroke; Google/Apple brand glyphs) built on react-native-svg. Barrel: `src/ui/index.ts`.

## Data layer + token refresh (`src/api/*`, `src/store/*`)
- `ApiClient` (`client.ts`): typed fetch, unwraps `{data,meta}` envelope, validates `data` with api-contract zod schemas, throws normalised `ApiClientError` from the error envelope.
- **Refresh interceptor**: on 401 for authed calls → single-flight `refreshAccessToken()` (shared in-flight promise), POSTs `auth/refresh`, persists the **rotated** pair, retries the original once; refresh failure → `onAuthFailure` (sign out). Client is decoupled from React via a `SessionBridge`; the app singleton (`api.ts`) wires it to the Zustand session store. Tokens never logged.
- `query-client.ts`: no-retry on 401/400, 2 retries otherwise. `hooks.ts`: useLogin/useRegister/useForgotPassword/useGoogle/useAppleSignIn/useMe.
- Store: `session.ts` (status loading/authed/guest, hydrate/signIn/setTokens/signOut), `ui.ts` (locale, onboarding flag). Tokens in `expo-secure-store` (`secure-storage.ts`, persist/read/clear only token strings).
- Biometrics (`lib/biometrics.ts`): availability-guarded no-op wrapper over expo-local-authentication.

## Navigation + screens (`app/*`)
- `app/_layout.tsx`: providers (GestureHandlerRootView, SafeAreaProvider, I18nextProvider, QueryClientProvider), font+session gate holds splash, auth-redirect via pure `resolveAuthRedirect` (`lib/auth-routing.ts`).
- Tabs use the **headless `expo-router/ui`** (`Tabs`/`TabSlot` + `BottomNav` composing `TabList`/`TabTrigger`) — Home · Pantry · [center FAB] · Meals · Shopping. FAB routes to `/scan` (not a tab).
- Auth stack (page ①, all real + wired): Language Gate, Onboarding ×2, Login, Sign Up, Password Recovery. Google/Apple buttons + biometric unlock present (`SocialAuthButtons`).
- **Real** screens: 4 tabs (foundation scaffolds w/ empty states), **Settings** (locale switch + sign out).
- **Placeholders** (clearly labelled "Coming soon", later phases): Scan modal, Spending, Household, Notifications, Paywall — navigation wired end-to-end.

## i18n (`src/i18n/*`)
i18next + react-i18next, **vi (default/fallback) + en** bundles, locale **codes**, device-default resolution via expo-localization validated against `localeSchema`. Typed `t()` (i18next.d.ts augments resources with the vi shape; a `DeepStringify` widens literals so other locales differ). Add a 5th locale = drop a bundle + extend the enum.

## Tests (jest-expo + RNTL 14) — 16 passing, 5 suites
- Component render + a11y: Button, Input, Card, Fab (`components.test.tsx`).
- Auth-flow integration vs a mocked api client: success stores tokens + marks session authed (`login-flow.test.tsx`); failure shows error + stays guest (`login-error.test.tsx`).
- Token refresh unit (`token-refresh.test.ts`): 401→refresh→retry, refresh-fail→sign-out, single-flight (one refresh for concurrent 401s).
- Redirect unit (`auth-routing.test.ts`): guest→language, authed→tabs, loading/no-op.

## Verification (actual output)
- `pnpm --filter @kitchenpal/mobile lint` → **lint OK** (exit 0).
- `pnpm --filter @kitchenpal/mobile typecheck` → **typecheck OK** (exit 0).
- `pnpm --filter @kitchenpal/mobile test` → **Test Suites: 5 passed; Tests: 16 passed.**
- `pnpm --filter @kitchenpal/mobile build` → `expo export --platform web` → **Exported: dist**, web bundle (2.6MB) + **26 static routes** (all tabs/auth/menu/scan).
- Root gate: `pnpm lint` 6/6, `pnpm typecheck` 6/6, `pnpm test` 6/6 (backend **64** + mobile **16**), `pnpm build` 4/4 — **workspace still green** (backend/packages untouched).

## `build` choice
Defined as `expo export --platform web --output-dir dist` — a real Metro bundle + static route export that catches resolution/import/type-erasure errors with no native device or simulator. Web output (`web.output: static`) is the most self-contained target and exercised reanimated 4, expo-router/ui, svg, i18n, and all workspace-package resolution.

## Visual-parity notes vs Figma "Warm & Cozy"
- 100% of color/spacing/radius/shadow/type pulled from `@kitchenpal/design-tokens` `rnTheme`; zero ad-hoc hex/spacing. Card radius 18, pill/full chips, 1.8 line icons, soft warm elevation, primary terracotta CTAs — all match tokens.
- Ingredient/food surfaces use **line icons in soft-tinted circles** (rendering rule); cooked-dish emoji not needed at this layer.
- Icons are hand-drawn line paths approximating Figma `icon/*`/`food/*` geometry (not pixel-identical to the Figma vectors). Per-component pixel diffing against Figma screenshots was not done (no screenshot pipeline in this env) — recommend a screen-gallery visual QA pass in review.

## Deviations / decisions
- **expo-router 57 dropped React Navigation** (now `standard-navigation` + radix on web). Used the headless `expo-router/ui` Tabs instead of a `tabBar`+`BottomTabBarProps` custom bar. Cleaner for the center-FAB layout; no `@react-navigation/*` dependency.
- **React 19 + RNTL 14** `render` is async and the test renderer corrupts on a 2nd async-effect-heavy render in one file (2nd render yields an empty tree). Split the login integration test into two single-render files (`login-flow` success, `login-error` failure) — both green. Component tests (no async mutations) run 4 renders/file fine.
- Reanimated 4's bundled Jest mock still imports the native worklets layer (crashes in node) → provided a minimal hand-rolled `react-native-reanimated` mock in `jest.setup.js`.
- Social sign-in **buttons are present and the mutations/endpoints are wired**, but native provider token acquisition (expo-auth-session / apple-authentication) is deferred to a provider-config phase — buttons currently have no acquisition handler wired (no fake tokens). Biometric unlock is fully real (guarded no-op when unavailable).
- Reconciled leftover files from a prior partial run that matched this architecture (eslint config, secure-storage, onboarding, tabs layout, auth-routing impl+test, login-flow test) and deleted two orphan duplicates (`src/ui/SocialAuthButtons.tsx`, `src/ui/states/StateViews.tsx`).
- `eslint.config.js` → `eslint.config.mjs` (matches backend; silences the CJS-reparse warning).

## Unresolved questions
1. Social OAuth: confirm the intended client libs (expo-auth-session for Google, expo-apple-authentication for Apple) + where client IDs live, so the buttons can acquire real idTokens.
2. Backend `auth/refresh` response: confirmed assumption is envelope `data = tokenPair`. If it returns `{user,tokens}` instead, the refresh parser needs a one-line schema swap.
3. Home dashboard sections currently show empty states; confirm which Phase-4/5 endpoints feed expiring-soon / today's meals so the queries can be added.

---

## Review fixes applied (code-reviewer round 1)

All fixes scoped to `apps/mobile/**`; 16 original tests preserved, 6 tests added (22 total).

- **H1 — sign-out now revokes server-side.** `store/session.ts` `signOut()` reads the refresh token, best-effort `await authApi.logout(refreshToken)` (errors swallowed so offline sign-out still works), THEN clears secure store + local state. Verified the backend `auth/logout` is `@Public()` and takes the refresh token in the body, so `api/auth.ts` `logout` was switched to `auth: false` — this prevents the 401→refresh interceptor from recursing back into sign-out. Test: `store/__tests__/session-signout.test.ts` (revoke called with token; still signs out on revoke failure; skips when no token).
- **M1 — errors localized.** New `lib/error-message.ts` `resolveErrorMessage(error, t)` maps client synthetic codes (`NETWORK_ERROR`, `INVALID_RESPONSE`, `HTTP_ERROR`, `SESSION_EXPIRED`) and common backend auth codes (invalid-credentials, validation, rate-limited, email-taken, unauthenticated/expired) → localized `errors.*` keys in vi + en, falling back to the server message then a generic localized string — no raw English leaks. Login / Sign Up / Password Recovery now render the resolved string (removed the `error.message` passthrough). `login-error.test.tsx` updated to assert the localized copy.
- **M2 — locale + onboarding persist across cold start.** New `store/preferences-storage.ts` (expo-secure-store) persists `kp.locale` + `kp.onboarded`; `store/ui.ts` `setLocale`/`completeOnboarding` write-through and a new `hydrate()` rehydrates on boot. `app/_layout.tsx` now hydrates session + preferences before routing, applies the persisted locale via `changeLocale`, and gates readiness on `preferencesHydrated`. A returning (onboarded) guest now skips the language gate and lands on Login (`resolveAuthRedirect` gained a `hasCompletedOnboarding` param → `RETURNING_GUEST_ENTRY` vs `LANGUAGE_GATE_ENTRY`). Tests: `store/__tests__/preferences-persistence.test.ts` (round-trip) + updated `lib/__tests__/auth-routing.test.ts`.
- **L1 — retry-after-refresh that still 401s now signs out.** `api/client.ts`: on an `isRetry` request that returns 401 for an authed call, `onAuthFailure()` fires. Test added to `api/__tests__/token-refresh.test.ts`.
- **L3 — password-reveal a11y label localized.** `ui/Input.tsx` uses `t("common.showPassword"|"common.hidePassword")` (keys added to vi + en).
- **L2 (deferred, per review)** — one-frame `(tabs)` flash for a guest cold start: left as-is. A clean fix needs an index-route gate/`<Redirect>`; it's visual-only with no data leak, so not worth the routing churn now. **L4 (deferred)** — minor dimensional constants (52/1.5/icon sizes) left inline.

### Verification (actual output, after fixes)
- `pnpm --filter @kitchenpal/mobile lint` → EXIT=0.
- `pnpm --filter @kitchenpal/mobile typecheck` → clean.
- `pnpm --filter @kitchenpal/mobile test` → **Test Suites: 7 passed; Tests: 22 passed.**
- `pnpm --filter @kitchenpal/mobile build` (`expo export --platform web`) → **Exported: dist** (26 routes) — confirms the new session↔auth↔api circular import chain bundles fine (deferred/live-binding usage, no top-level use).
- Root: `pnpm lint` 6/6 · `pnpm typecheck` 6/6 · `pnpm test` 6/6 · `pnpm build` 4/4 — **workspace green, backend/packages untouched.**

### Notes / assumptions
- `auth/logout` called unauthenticated (verified `@Public()` in `auth.controller.ts`); this both matches the contract and avoids the sign-out↔refresh recursion.
- Backend error `code` values mapped in `error-message.ts` include sensible aliases; unmapped codes fall back to the (server) message → generic. If the backend uses different literals for validation/rate-limit/conflict, add the alias in one place.

Status: DONE
Summary: Applied all review fixes (H1 server-side revoke, M1 localized errors, M2 persisted locale+onboarding, L1 retry-401 sign-out, L3 i18n a11y label; L2/L4 deferred per review) in apps/mobile; added 6 tests (22 total) and kept every gate green — mobile lint/typecheck/test/expo-export and the full workspace build/lint/typecheck/test.
Concerns/Blockers: Social OAuth token acquisition still deferred (buttons + endpoints wired, native provider flow pending config); L2 one-frame guest tabs flash intentionally deferred (visual-only).
