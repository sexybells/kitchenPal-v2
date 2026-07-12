# Phase 8c — KitchenPal Admin Web App (frontend) report

Built the admin console from scratch at `apps/admin` (`@kitchenpal/admin`): Vite + React 19 + TypeScript + Tailwind (design-token preset) + shadcn-style components, consuming the Phase 8b admin API. Only `apps/admin/**` was created/modified.

## Stack choices
- **Router: React Router v7** (`react-router-dom`). Chosen over TanStack Router to avoid a route-tree codegen/typegen build step for an internal console — plain `<Routes>` is enough, less machinery (KISS/YAGNI).
- **Charts: recharts** (line + bar). All chart data transforms are pure functions in `features/reports/report-transforms.ts` (unit-tested). Chart colors come from `@kitchenpal/design-tokens` `colors` (no ad-hoc hex).
- **Server state: TanStack Query**. Session state: a small in-memory module store exposed via `useSyncExternalStore`.
- **Token storage: in-memory only** (`auth/session-store.ts`). Access AND refresh tokens live in module memory, never `localStorage`/`sessionStorage`. Rationale: the backend returns tokens in the response body (no httpOnly cookie), so persistent storage would expose them to XSS. In-memory keeps them unreadable from storage; the short admin access token (600s) is rotated silently via the refresh token during the tab's lifetime, and a full page reload deliberately drops the session (re-login) — matching the "short admin session" requirement. Logout revokes the refresh token server-side and clears memory.
- **Tailwind**: `{ presets: [tailwindPreset] }` from design-tokens; `tailwindcss-animate` for dialog transitions. shadcn set up manually (no CLI) so nothing at the repo root was touched.

## Auth flow
- `POST /auth/login` → `authResultSchema`. `loginAsAdmin` enforces `roles.includes("admin")`; a non-admin's freshly issued refresh token is **revoked** (`auth/logout`) and no session is set (`NOT_ADMIN` error surfaced inline). Admin → session set → redirect to dashboard.
- `RequireAdmin` guard re-checks the admin role on every protected route; anyone else → `/login`.
- Client (`api/client.ts`) mirrors the mobile client: unwraps the `{data, meta}` envelope, validates with api-contract zod, single-flight 401→refresh→retry (login/logout use `skipRefresh`), clears session on refresh failure.

## Screens / components
- **Shell**: `sidebar.tsx` (grouped nav, dev-only entries filtered in prod) + `app-shell.tsx` (responsive drawer + top bar with signed-in admin + logout).
- **Management tables** (all via reusable `DataTable`): Users (role toggle, suspend/reinstate, subscription assign/cancel in `user-manage-dialog`), Households, Recipes (create dialog + publish/unpublish + soft-delete), Pantry scans, Uploads, AI logs, External-search logs, Audit logs.
- **Subscriptions**: plan CRUD (`plan-form-dialog`); assignment is on the Users screen (`source=admin`). Dashboard + Subscriptions carry an explicit "monetization is admin-only in v1" notice.
- **Reports**: usage snapshot cards + growth/ai-trend line charts + ai-cost bar + cost summary, with a bucket (day/week/month) selector.
- **Settings**: integration toggles; secret-safe rendering (see below).
- **Dev tools**: seed plans / seed recipes / reset-dev-data, hidden via `isDevToolsEnabled()` (env `PROD`), destructive reset behind a confirm dialog.

## DataTable design
`components/data-table/`: `useAdminList` owns search term + a cursor stack (enabling Prev over cursor pagination; search resets to page 1) and fetches through an injected `fetchPage` bound to the typed API. `DataTable` is column-driven and generic, rendering explicit loading (skeletons), error, and empty states plus search + Prev/Next. Read-only screens use a thin `ResourceListPage` wrapper.

## Secret-safety in settings UI
The backend never persists/returns secrets; the UI adds defense in depth (`features/settings/secret-safety.ts`): any config entry whose KEY matches `/(secret|password|token|api[-_]?key|credential|private[-_]?key)/i` is masked as a "managed in env" badge — its value is never rendered. Covered by a test asserting a planted `apiKey` value never reaches the DOM while non-secret config (`provider: openai`) does.

## Tests (Vitest + RTL, hermetic — fetch/client mocked, no live backend)
21 tests / 7 files: auth-service (non-admin rejected + revoked, admin sets session), RequireAdmin (admin reaches screen; non-admin/anon → login), DataTable (render/search-param/cursor-paginate/empty), report transforms (success-rate + divide-by-zero), subscription assign calls the admin endpoint, settings never renders a secret, dev tools hidden in prod.

## Verification (actual)
- `pnpm --filter @kitchenpal/admin typecheck` → clean.
- `pnpm --filter @kitchenpal/admin lint` → clean (no `any`).
- `pnpm --filter @kitchenpal/admin test` → **7 files, 21 passed**.
- `pnpm --filter @kitchenpal/admin build` → vite build OK (dist ~848 kB JS / 244 kB gzip).
- Root workspace: `pnpm build` → **5/5**, `pnpm lint` → **7/7**, `pnpm typecheck` → **7/7**, `pnpm test` → **7/7** (backend 28 suites/186, api-contract 48, admin 21; mobile/backend/packages untouched).

## Deviations / notes
- Manual shadcn setup (no CLI) to avoid touching the repo root; native `<select>` used for simple dropdowns (a11y for free, fewer deps). Radix used for Dialog/Label/Switch/Slot.
- Pinned `vite@^5.4` (not 6) to match `vitest@2`'s vite peer and avoid dual-vite type conflicts.
- Search fires per-keystroke (TanStack Query dedupes/caches); no debounce added (KISS). Add one if request volume matters.
- Recipe create form builds a minimal recipe (ingredient names only, no per-ingredient qty/unit) — sufficient for admin seeding; extend if richer authoring is needed.
- Bundle is a single ~848 kB chunk (recharts-heavy). Warning only; `manualChunks`/lazy routes deferred (YAGNI for an internal tool).

## Unresolved questions
- Refresh-token persistence: current design drops the session on reload by choice (XSS-safe, short admin session). If admins need reload-survival, the backend would need an httpOnly refresh cookie — flagged for product/security decision.
- ai-costs will display zeros until backend AI call sites populate token/cost fields (known from 8b).

Status: DONE
Summary: Admin console built from scratch at apps/admin (auth+role gate, in-memory token storage, reusable DataTable, full management/subscription/report/settings/dev-tools screens, secret-safe settings); admin lint/typecheck/test/build green and root build/lint/typecheck/test green workspace-wide with backend/mobile/packages untouched.
Concerns/Blockers: Reload drops the session by design (no httpOnly refresh cookie from backend) — confirm if reload-survival is required.
