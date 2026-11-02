# Frontend bundle and code-loading audit (apps/web), 2026-11-02

Scope: JavaScript and CSS delivery, code splitting, Suspense and error
boundaries, tree shaking, service-worker precache. No backend or schema change.

## 1. Architecture found

| Item                         | State                                                                                                                                                                                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| React / React DOM            | 19.3.0                                                                                                                                                                                                                                                                   |
| React Compiler               | babel-plugin-react-compiler 1.0.0 via `reactCompilerPreset()` (+ `@rolldown/plugin-babel`); `src/features/landing/` excluded                                                                                                                                             |
| Bundler                      | Vite 8.1.5 on Rolldown 1.1.5; pnpm 8 workspace, turbo                                                                                                                                                                                                                    |
| Router                       | react-router-dom 6.30.3 data router (`createBrowserRouter`), `future.v7_startTransition`; view transitions through `viewTransition` links                                                                                                                                |
| Route splitting              | **Already present for every page**: each route uses the data router's `lazy` property (`page()` in `src/app/router.tsx`), and the module loads before the route commits. That's why there was only one `<Suspense>` (walkthrough `Runner`): `lazy` routes don't suspend. |
| Component-level lazy loading | Already present: face-api.js, firebase, socket.io-client, WebAuthn, push-unsubscribe, walkthrough runner (react-joyride), walkthrough registry                                                                                                                           |
| Build output                 | Client build with manifest → SSR prerender of 4 public pages into `dist/*.html` → service worker (Workbox `injectManifest`)                                                                                                                                              |
| Fonts                        | System font stack only; no web fonts are downloaded                                                                                                                                                                                                                      |
| Images                       | Landing screenshots are lossless WebP, `loading="lazy"` below the fold, hero preloaded                                                                                                                                                                                   |

## 2. Problems established (baseline build + browser runs)

1. **Leaky vendor chunks.** `manualChunks` substring tests plus Rolldown's
   default `includeDependenciesRecursively` put `@floating-ui/*` (only used by
   the lazy react-joyride) into the initial `vendor-react`, and React's own
   module into `vendor-motion`, so `vendor-react` imported `vendor-motion`.
2. **The signed-in shell was in the entry chunk.** `AppShell` was a static
   import of the router, so the public landing page and sign-in page
   downloaded the sidebar, command palette, offline status UI and providers.
3. **Two copies of `@remix-run/router`.** The workspace security override
   lifts `react-router` to 6.30.4 (router 1.23.3), but `react-router-dom`
   6.30.3 pins 1.23.2. Both shipped, and `createBrowserRouter` ran on the
   older copy, which lacks 1.23.3's double-slash normalisation of redirect
   locations.
4. **Blank screen on slow direct loads.** React mounted before the first
   route's code had arrived. The router rendered nothing, which replaced
   index.html's loader (or the prerendered page) with an empty screen: 15 of 39
   samples blank, from about 124 ms.
5. **No feedback during slow navigation.** The old page stayed up with no
   sign that anything was happening.
6. **Chunk failures lost the shell and showed raw errors**, for example
   "Unable to preload CSS for http://…/Holidays-….css". There was no
   recovery for stale deployments beyond a manual reload.
7. **Every app launch loaded the landing page.** `dist/index.html` is both the
   prerendered landing page and the SPA/service-worker shell, so `/dashboard`
   also fetched `Landing.js`, `BrandMark`, `billing`, `constants` and
   `Landing.css`, and preloaded the hero screenshot.
8. **The service worker precached the 650 KB face-matching library**
   (`es6-*.js`: tfjs-core + face-api) for every visitor. Face check-in loads
   its models from jsdelivr, so it can't work offline anyway.

## 3. Changes made

| Change                                                                                                                                                                                                                                          | Files                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `codeSplitting.groups` with priorities and exact package tests: `vendor-react` (react, react-dom, scheduler, react-router(-dom), @remix-run/router) at priority 20, `vendor-motion` at 10, and a named `vendor-faceapi` group                   | `apps/web/vite.config.ts`                                             |
| Alias `@remix-run/router` to react-router's own copy (resolved through the dependency chain, no lockfile change): one router, the patched one                                                                                                   | `apps/web/vite.config.ts`                                             |
| Signed-in layout route made `lazy` (AppShell is its own chunk and loads in parallel with the page)                                                                                                                                              | `apps/web/src/app/router.tsx`                                         |
| Pathless child route with `errorElement`, so page errors render inside the shell                                                                                                                                                                | `apps/web/src/app/router.tsx`                                         |
| Targeted prefetch: the sign-in route fetches the shell + Today on idle; skipped when Save-Data is on                                                                                                                                            | `apps/web/src/app/router.tsx`                                         |
| Mount React only once `router.state.initialized`, so the loader or prerendered page stays on screen                                                                                                                                             | `apps/web/src/main.tsx`                                               |
| Pending-navigation hairline (`useNavigation()`): appears after 300 ms, sets `aria-busy` on `<main>`, is a `role="progressbar"`, no layout shift (sticky, zero height), static under Reduce Motion                                               | `apps/web/src/shell/AppShell.tsx`, `shell.module.css`                 |
| Chunk-load errors: "This page couldn’t be loaded" with Try Again. One automatic reload picks up a new deployment; it's skipped offline, while `isBusy()` (unsaved edits or uploads), and if it already ran in the last minute, so it can't loop | `apps/web/src/features/system/System.tsx`                             |
| `dist/app.html` (unprerendered index.html) written by prerender; the SW serves it for in-app navigations (`/` still gets the prerendered `index.html`)                                                                                          | `scripts/prerender.mjs`, `sw/sw.ts`, `scripts/inject-sw-manifest.mjs` |
| `vendor-faceapi-*.js` left out of the precache; `app.html` added                                                                                                                                                                                | `scripts/inject-sw-manifest.mjs`                                      |
| Docs updated                                                                                                                                                                                                                                    | `docs/offline-first.md`                                               |

## 4. Measurements

Build sizes are from `.vite/manifest.json`: initial = entry plus its static
import closure, gzip level 9 / brotli computed locally. Browser figures are
production builds served with gzip (level 6), API fixtures intercepted in
Playwright (no backend, no database), Chromium, cold context, no cache, SW
blocked unless stated.

| Metric                                                                       |                                  Baseline |                        Optimized |                                         Difference |
| ---------------------------------------------------------------------------- | ----------------------------------------: | -------------------------------: | -------------------------------------------------: |
| Initial JS (raw)                                                             |                                  721.2 KB |                         637.2 KB |                                  −84.0 KB (−11.6%) |
| Initial JS (gzip / brotli)                                                   |                          238.8 / 207.8 KB |                 209.2 / 182.9 KB |                 −29.6 / −24.9 KB (−12.4% / −12.0%) |
| Initial JS files                                                             |                                        13 |                                9 |                                                 −4 |
| Initial CSS (raw / gzip)                                                     |                            53.3 / 11.9 KB |                   43.1 / 10.1 KB |                                    −10.2 / −1.8 KB |
| Largest initial chunk (`vendor-react`, raw / gzip)                           |                           297.3 / 92.0 KB |                  278.1 / 86.5 KB |                                    −19.2 / −5.5 KB |
| Total JS (gzip), files                                                       |                             826.8 KB, 119 |                    828.5 KB, 124 |             +1.7 KB, +5 (expected, more splitting) |
| SW precache                                                                  |                         167 files, 3.0 MB |                174 files, 2.4 MB |                                            −0.6 MB |
| Landing `/`, signed out: JS transfer / requests (all)                        |                      258.9 KB, 17 JS / 28 |             229.2 KB, 13 JS / 24 |                                       −29.7 KB, −4 |
| Sign-in page, own load (Save-Data on, so no prefetch)                        |                           279.7 KB, 19 JS |                  249.8 KB, 15 JS |                                           −29.9 KB |
| Sign-in page incl. idle prefetch of shell + Today                            |                                       n/a |                         314.3 KB | +64.5 KB prefetched, then not needed after sign-in |
| `/dashboard` first visit, index.html fallback (Amplify today)                |          311.4 KB JS, 29.6 KB CSS, 38 req | 306.4 KB JS, 30.8 KB CSS, 45 req |                    −5.0 KB JS (shell now separate) |
| `/dashboard` via `app.html` (SW relaunch; or with the Amplify rewrite below) |                                       n/a |         286.7 KB JS, 20.9 KB CSS |               −24.7 KB JS, −8.7 KB CSS vs baseline |
| SW relaunch of `/dashboard` loads landing code                               | yes (Landing.js/.css, BrandMark, billing) |                               no |                                              fixed |
| Slow direct load (route code +1.5 s): blank samples                          |                                   15 / 39 |                           0 / 39 |                                              fixed |
| Slow navigation (+2 s): visible feedback                                     |                                      none |           hairline + `aria-busy` |                                              added |
| Navigation to Helpdesk: requests                                             |                 1 route + 5 shared chunks |                             same |                                          unchanged |
| Repeat visit to a loaded route: new JS                                       |                                      none |                             none |                                          unchanged |

## 5. Behaviour verified (production builds)

- Direct load of a nested route (`/employee-management/aarav.shah`) renders.
- Dashboard → Helpdesk loads its chunk on demand; back and forward work.
- Rapid navigation through four links ends on the last one (Approvals).
- Signed out, `/payroll/salary-management/u-1` redirects to `/login`.
- Failed chunk (aborted request): error shown inside the shell with the
  sidebar intact; Try Again recovers.
- Stale deployment (chunk 404): exactly one automatic reload, then the
  friendly message; Try Again recovers once the file is back.
- View transitions with motion allowed: 5 of 5 transitions finish, including
  into routes whose code is delayed 800 ms and on back/forward. Identical to
  baseline, no page errors.
- Service worker: precaches `app.html`, not `vendor-faceapi`; a relaunch is
  served from the SW without landing code; `/` still gets the prerendered
  landing page.
- React Compiler output is present in the split chunks (e.g. AppShell 32,
  Today 36 memo caches); landing is excluded as configured.
- `pnpm build` (tsc, client, SSR prerender, SW) passes; vitest 23 files /
  205 tests pass; ESLint on changed files: 0 errors.
- Not applicable: tenant switching. The web app has no in-session
  organisation switcher.

## 6. Looked at and left alone, with reasons

- **More Suspense boundaries.** Data loading is `useEffect`-based (not
  Suspense-enabled) and routes use `lazy`, which loads before commit. Extra
  boundaries would add fallbacks without anything to suspend on.
- **framer-motion in the initial chunk (44.5 KB gz).** The landing page,
  sign-in page, shell and the session root's always-mounted dialogs and toasts
  all use it, so every first screen needs it.
- **`pickers.tsx` in the initial chunk.** `controls.tsx` (Button,
  SegmentedControl) imports `Select` from `fields`, which routes to the
  pickers. Splitting it would put Suspense fallbacks inside form fields.
- **zod (12.5 KB gz), DOMPurify, ua-parser-js, react-joyride, socket.io,
  firebase, face-api.** Already outside the initial chunk, loaded only by the
  routes and actions that use them.
- **`@next/ui` barrel.** Tree-shakes correctly: Table, skeletons, charts and
  RichText land in route chunks.
- **Dev-only code.** No `debugger`, no Node built-ins in the bundle;
  `console.log` occurs only inside third-party joyride and face-api code.
- **Unused CSS.** CSS is already split per route (39 files). Removing rules
  would need coverage runs across every role and screen; not done.

## 7. Recommended follow-ups (not done)

1. **Amplify rewrite to `app.html`** for in-app paths (keep `/` and the
   prerendered pages on their own files). First visits to deep links would then
   skip the landing page's code and CSS: about −20 KB JS and −10 KB CSS on
   `/dashboard`, as measured above. This needs a hosting rule change, so it
   wasn't applied (see `docs/seo.md` and `cloudformation/amplify-rules.json`).
2. **Bump `react-router-dom` to 6.30.4** to match the override; the Vite
   alias can then go. This is a lockfile change.
3. **Service-worker registration for anonymous landing visitors.** They still
   precache 2.4 MB in the background. Deferring registration until sign-in
   (or until a remembered offline session exists) would spare marketing
   traffic, but it changes the offline-first behaviour, so it's a product call.
4. Signed-out deep links still download the target page's code before the
   redirect to `/login`. This would need a session-aware route loader; it's
   minor.
