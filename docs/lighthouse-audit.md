# Lighthouse audit — 2026-11-02

Lab audit of the Docker stack at `https://localhost`, with fixes and a
before/after comparison under identical conditions. Lighthouse numbers are
**lab measurements** (simulated throttling on one machine), not field data;
TBT is Lighthouse's lab proxy for responsiveness, not INP. Real-user Core Web
Vitals (CrUX / Search Console for praesto.in) remain the authority for
production.

## 1. Existing reports

None. Searched the repo (root, `docs/`, `reports/`, `artifacts/`,
`lighthouse/`, `.lighthouseci/`), the CI workflows (`ci.yml`,
`build-and-push.yml`, `deploy-ec2.yml`: no Lighthouse step), the React 19
artifacts folder (`~/Downloads/hrms-react19-artifacts`) and git history. No
Lighthouse HTML/JSON/CSV, LHCI config or Lighthouse script existed; earlier
performance work (`docs/performance.md`,
`docs/performance/frontend-bundle-audit.md`) used custom Playwright harnesses.
The baseline below is therefore new.

## 2. Environment and method

|                |                                                                                                                                                                                          |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Target         | `hrms-dev-web` (nginx 1.27, `docker/web.Dockerfile`, production Vite build + prerender), API via nginx → `hrms-dev-api-gateway`                                                          |
| Build verified | Served `index.html` asset hashes matched `apps/web/dist` (built from the current working tree) before the baseline; after each rebuild the container's files were checked for the change |
| TLS            | mkcert certificate (`packages/certificates`, SAN localhost/127.0.0.1), CA trusted in the macOS keychain — **no certificate bypass was needed**                                           |
| Lighthouse     | 13.5.0 (isolated install in `~/Downloads/hrms-lighthouse-tool`, nothing global) via the Node API + puppeteer-core 25.16                                                                  |
| Browser        | Google Chrome 156.0.8078.79, `--headless=new`, fresh profile per run                                                                                                                     |
| Mobile         | Lighthouse default: Moto G Power emulation, simulated throttling 150 ms RTT / 1.6 Mbps / 4× CPU                                                                                          |
| Desktop        | `--preset=desktop`: 40 ms RTT / 10 Mbps / 1× CPU                                                                                                                                         |
| Runs           | 3 per route × mode, medians reported (66 runs per set)                                                                                                                                   |
| Categories     | Performance, Accessibility, Best Practices, SEO (Lighthouse 13's new "agentic browsing" group — `llms-txt`, `ard-schema` — is out of scope)                                              |

**Public routes** (`/`, `/login`, `/privacy-policy`) were audited exactly as
served, signed out, against the real gateway (which only answers
`/refresh-token` with 401).

**Signed-in routes** could not use a real session: sign-in is Google OAuth or
passkey only, and the local stack's MongoDB is the production database, so a
real session would write production data. They use the React 19 harness's
fictional "Halcyon Labs" fixtures
(`~/Downloads/hrms-react19-artifacts/harness/fixtures.mjs`): HTML, JS, CSS and
images come from the running nginx; `/api/*` and `/socket.io/*` HTTP requests
are answered inside the browser (40 ms latency), so nothing reaches the
database. Limitations: fixture data is small and some screens (analytics)
show empty states; the WebSocket upgrade bypasses request interception and the
real gateway rejects the fixture token, which logs one console error per
signed-in page in both sets (a fixture artifact, not an app defect).

Routes: landing `/`, sign-in `/login`, `/privacy-policy`, dashboard
`/dashboard`, employees `/employee-management/employee-list`, attendance
`/attendance`, leave `/attendance/view-leave-applications`, recruitment
`/job-openings/view-job-openings`, analytics `/analytics/workforce`, settings
`/settings/company`, helpdesk `/helpdesk`.

## 3. Results (medians of 3)

| Route       | Mode    | Perf         | A11y         | BP      | SEO       | FCP s       | LCP s       | TBT ms  | CLS               | Transfer KB | JS KB     |
| ----------- | ------- | ------------ | ------------ | ------- | --------- | ----------- | ----------- | ------- | ----------------- | ----------- | --------- |
| landing     | mobile  | 83 → **95**  | 100 → 100    | 96 → 96 | 100 → 100 | 3.09 → 2.11 | 3.80 → 2.56 | 15 → 31 | 0 → 0             | 922 → 540   | 246 → 241 |
| landing     | desktop | 98 → **100** | 97 → 97      | 96 → 96 | 100 → 100 | 0.77 → 0.45 | 1.03 → 0.53 | 0 → 0   | 0 → 0             | 806 → 707   | 246 → 241 |
| login       | mobile  | 76 → **94**  | 95 → **100** | 96 → 96 | 100 → 100 | 3.24 → 2.03 | 4.73 → 2.86 | 0 → 0   | 0 → 0             | 544 → 362   | 354 → 320 |
| login       | desktop | 97 → **100** | 95 → **100** | 96 → 96 | 100 → 100 | 0.77 → 0.43 | 1.19 → 0.61 | 0 → 0   | 0 → 0             | 544 → 362   | 354 → 320 |
| privacy     | mobile  | 81 → **96**  | 95 → **100** | 96 → 96 | 100 → 100 | 3.09 → 2.11 | 3.98 → 2.41 | 0 → 0   | 0 → 0             | 446 → 273   | 273 → 243 |
| privacy     | desktop | 98 → **100** | 95 → **100** | 96 → 96 | 100 → 100 | 0.77 → 0.45 | 0.96 → 0.49 | 0 → 0   | 0 → 0             | 446 → 273   | 273 → 243 |
| dashboard   | mobile  | 68 → **95**  | 96 → **100** | 96 → 96 | 54 → 54   | 3.09 → 1.96 | 4.98 → 2.71 | 0 → 0   | **0.178 → 0.001** | 517 → 335   | 331 → 296 |
| dashboard   | desktop | 95 → **100** | 96 → **100** | 96 → 96 | 54 → 54   | 0.77 → 0.41 | 1.34 → 0.57 | 0 → 0   | **0.071 → 0**     | 517 → 335   | 331 → 296 |
| employees   | mobile  | 81 → **96**  | 96 → **100** | 96 → 96 | 54 → 54   | 2.49 → 1.95 | 4.46 → 2.55 | 0 → 0   | 0 → 0             | 476 → 297   | 293 → 260 |
| employees   | desktop | 97 → **100** | 96 → **100** | 96 → 96 | 54 → 54   | 0.65 → 0.40 | 1.14 → 0.52 | 0 → 0   | 0.006 → 0.006     | 524 → 297   | 293 → 260 |
| attendance  | mobile  | 75 → **94**  | 96 → **100** | 96 → 96 | 54 → 54   | 3.09 → 1.96 | 5.16 → 2.86 | 0 → 0   | 0.012 → 0.012     | 531 → 347   | 345 → 309 |
| attendance  | desktop | 95 → **100** | 96 → **100** | 96 → 96 | 54 → 54   | 0.77 → 0.40 | 1.41 → 0.56 | 0 → 0   | 0.001 → 0.001     | 531 → 347   | 345 → 309 |
| leave       | mobile  | 77 → **94**  | 96 → **100** | 96 → 96 | 54 → 54   | 3.00 → 1.96 | 5.16 → 2.86 | 0 → 0   | 0 → 0             | 534 → 350   | 345 → 309 |
| leave       | desktop | 95 → **100** | 96 → **100** | 96 → 96 | 54 → 54   | 0.77 → 0.40 | 1.41 → 0.56 | 0 → 0   | 0 → 0             | 534 → 350   | 345 → 309 |
| recruitment | mobile  | 79 → **95**  | 96 → **100** | 96 → 96 | 54 → 54   | 3.09 → 2.03 | 4.46 → 2.55 | 0 → 0   | 0 → 0             | 471 → 292   | 297 → 263 |
| recruitment | desktop | 97 → **100** | 96 → **100** | 96 → 96 | 54 → 54   | 0.61 → 0.40 | 1.18 → 0.52 | 0 → 0   | 0 → 0             | 471 → 292   | 297 → 263 |
| analytics   | mobile  | 79 → **94**  | 96 → **100** | 96 → 96 | 54 → 54   | 2.31 → 1.95 | 4.52 → 2.55 | 0 → 0   | 0.080 → 0.080     | 477 → 297   | 300 → 267 |
| analytics   | desktop | 97 → **100** | 96 → **100** | 96 → 96 | 54 → 54   | 0.77 → 0.40 | 1.21 → 0.52 | 0 → 0   | 0.016 → 0.016     | 477 → 297   | 300 → 267 |
| settings    | mobile  | 78 → **94**  | 96 → **100** | 96 → 96 | 54 → 54   | 2.64 → 2.03 | 4.88 → 2.70 | 0 → 0   | 0.001 → 0.001     | 499 → 319   | 318 → 285 |
| settings    | desktop | 97 → **100** | 96 → **100** | 96 → 96 | 54 → 54   | 0.77 → 0.41 | 1.27 → 0.53 | 0 → 0   | 0 → 0             | 499 → 319   | 318 → 285 |
| helpdesk    | mobile  | 78 → **95**  | 96 → **100** | 96 → 96 | 54 → 54   | 3.09 → 2.10 | 4.52 → 2.63 | 0 → 0   | 0 → 0             | 476 → 296   | 300 → 266 |
| helpdesk    | desktop | 97 → **100** | 96 → **100** | 96 → 96 | 54 → 54   | 0.77 → 0.42 | 1.20 → 0.52 | 0 → 0   | 0 → 0             | 476 → 296   | 300 → 266 |

Transfer/JS are Lighthouse's `resource-summary` transfer sizes (KB = 1024 B).
Variability: baseline mobile performance spread 1–5 points per route
(e.g. recruitment 77–82); after-fix spread 0–2 points. Every after-fix run of
every route beats every baseline run of the same route and mode. Landing
mobile TBT 15 → 31 ms is within noise: the longest task in any after-fix
landing run is 94 ms (desktop: none over 50 ms), against the 3,002 ms
favicon task seen on a cold baseline load.

Initial code per entry page (gzip, from the built HTML's scripts,
modulepreloads and stylesheets — unchanged by this pass):

| Entry                               | JS       | CSS     | HTML    |
| ----------------------------------- | -------- | ------- | ------- |
| `index.html` (landing, prerendered) | 229.4 KB | 20.0 KB | 12.6 KB |
| `app.html` (every other app route)  | 209.5 KB | 10.1 KB | 1.9 KB  |

Before this pass nginx served `index.html` for every deep link, so a first
load of `/login` or `/dashboard` paid the landing page's 19.9 KB JS, 9.9 KB
CSS (render-blocking) and 10.7 KB of hidden markup extra.

**Unchanged and why**

- SEO 54 on signed-in routes: `is-crawlable` and `meta-description` fail
  because these pages are deliberately `noindex` (`src/app/seo.ts`). Correct.
- Best Practices 96 everywhere: `errors-in-console`. Public pages: Chrome logs
  the expected 401 from `/refresh-token` for a signed-out visitor (see §6).
  Signed-in pages: the fixture-mode WebSocket rejection (§2).
- Landing desktop A11y 97: LeaveFlow contrast (§6).

## 4. Issues found and fixed

| #   | Issue                                                                                                                                                                 | Category         | Routes                             | Evidence → root cause                                                                                                                                                                                                                                                                                                  | Severity | Fix                                                                                                                                                                                                                                                                | Verification                                                                                                                           |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 3.0 s main-thread task on a cold landing load; favicon replaced by a 32 px PNG data URL on every signed-out page; title briefly set to "HRMS"                         | Perf / SEO       | all signed-out                     | `long-tasks`: 3,002 ms in the entry chunk; CPU profile: `t.onload` 648 ms self time at 4× CPU → `clearFaviconDot()` runs on every signed-out mount and decodes the multi-size `favicon.ico` into a canvas, `toDataURL`s it and resets `document.title`                                                                 | High     | `clearFaviconDot` only restores `/favicon.ico` when a dot data URL is actually set; no canvas, no title write                                                                                                                                                      | Live page: icon stays `/favicon.ico`, title correct, no favicon task in traces                                                         |
| 2   | Dashboard CLS 0.178 mobile / 0.071 desktop                                                                                                                            | Perf             | /dashboard                         | Layout-shift observer: the widgets grid moved 244 → 456 px when the tour card ("New to Praesto?") rendered after `GET /walkthrough/progress`; React also reused the skeleton `<div>` for the grid, so the swap counted as a move. Second shift (6 px, desktop): the brief's 18 px skeleton vs its 24 px line           | High     | `Today.tsx`: grid and card wait for both the layout and the walkthrough progress (skeleton until then); skeleton and grid keyed apart; brief skeleton given 3 px margins to fill its line                                                                          | Fixtures with each request delayed 1.5 s at 412 and 1350 px: CLS ≤ 0.0008 in all cases; Lighthouse 0.178 → 0.001                       |
| 3   | Accent `#2A78D6` text 3.9–4.4 : 1; success `#1E7F45` 4.38 : 1 on its tint; text-3 4.43 : 1 on neutral-soft                                                            | A11y             | every app page, login, legal pages | `color-contrast` nodes: links, plain buttons, "Continue with Google", tab bar, badges, sidebar search (the token file itself noted accent was "just under 4.5:1")                                                                                                                                                      | High     | `tokens.css` (light theme): accent `#266EC6` (hover/pressed scaled), success `#1D7C44`, text-3 `#696A71`. Same hues; ≥ 4.5 : 1 on white, accent-soft, window, grouped and tab-bar surfaces                                                                         | A11y 95–96 → 100 on every route but landing desktop                                                                                    |
| 4   | Every deep link and `/login` served the prerendered landing page; `/privacy-policy` etc. never got their prerendered HTML; `/assets` and `/images` returned 301 → 403 | Perf / SEO / bug | all but `/`                        | nginx `try_files $uri $uri/ /index.html`; `/dashboard` loaded `Landing-*.css` render-blocking; curl `/assets` → 301                                                                                                                                                                                                    | High     | `docker/nginx.conf`: `location = /` → index.html; `try_files $uri $uri.html /app.html` (mirrors the service worker, `sw/sw.ts`)                                                                                                                                    | `/dashboard`, `/login`, `/assets` → app.html (5.4 KB); `/privacy-policy` → its own page; `/nope.png` → 404                             |
| 5   | HTTP/1.1 only                                                                                                                                                         | Perf             | all                                | `network-requests` protocol `http/1.1`; ~30–60 requests per page                                                                                                                                                                                                                                                       | Medium   | `http2 on;`                                                                                                                                                                                                                                                        | curl / Chrome report `h2`; `/api`, `/health`, Socket.IO polling and WebSocket verified                                                 |
| 6   | LCP image fetched at Low priority                                                                                                                                     | Perf             | /                                  | `lcp-discovery-insight`: "fetchpriority=high should be applied"; CDP: parser request `initialPriority: Low`. React 19's prerender emits `<link rel=preload as=image>` before the hero image and copies only the camelCase `fetchPriority` prop; the component spread a lowercase `fetchpriority` (React 18 workaround) | Medium   | `MacBookShowcase.tsx`: `fetchPriority="high"`                                                                                                                                                                                                                      | Prerendered preload now carries `fetchPriority="high"` and `imageSrcSet`                                                               |
| 7   | 645 KB of images on a mobile landing load; captures are 2880 px wide shown ~330 px; six hero screens downloaded alongside the critical JS                             | Perf             | /                                  | `image-delivery-insight` 562 KiB savings; network: 6 screenshots requested ~100 ms after the first                                                                                                                                                                                                                     | Medium   | `scripts/showcase-variants.mjs` writes lossless 720/1440 px copies (36 files); `srcSet`/`sizes` on showcase and cropped shots (sizes derived from measured layout, erring larger); other hero screens mounted after `load` + idle instead of after the first image | Mobile landing transfer 922 → 540 KB; desktop @1× picks 1440, @2× the original; carousel still advances at 7 s with all screens loaded |
| 8   | Unversioned images uncached; HTML `no-store` blocks back/forward cache                                                                                                | Perf             | all                                | `cache-insight` (`/images/*`, `favicon.ico` 0 s); `bf-cache`: main resource `no-store`                                                                                                                                                                                                                                 | Low      | Images/icons outside `/assets`: `public, max-age=86400`; HTML: `no-cache` (still revalidated every load; it is the same static shell for everyone — no tenant data); gzip for manifest/wasm/xml/ico                                                                | Response headers checked; security headers present on every block                                                                      |
| 9   | `[performRefresh] HTTP 401` console error for every signed-out visitor                                                                                                | BP               | public                             | `errors-in-console`                                                                                                                                                                                                                                                                                                    | Low      | 401 (the normal "no session" answer) is no longer logged; other failures still are                                                                                                                                                                                 | Console on `/` shows only Chrome's own network line                                                                                    |

Also: `.dockerignore` now excludes `artifacts/` (the reports would otherwise
be copied into the web image's builder stage).

Not changed, by decision:

- **Login prefetches the shell and Today** in idle time
  (`prefetchSignedInApp`, `router.tsx`). Lighthouse counts it as unused JS
  (~97 KB), but it makes the step after sign-in instant and respects
  Save-Data. Kept.
- **React Compiler and router-level `lazy`**: untouched. No Suspense
  boundaries were added.
- **Bundle chunking**: the composition analysis found no new duplication or
  dev-only code (see `docs/performance/frontend-bundle-audit.md` for the
  earlier pass); no manual chunk changes were made.

## 5. Files changed

| File                                                                                 | Change                                                             |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `apps/web/src/shared-core/shared/utils/faviconUtils.tsx`                             | #1                                                                 |
| `apps/web/src/features/dashboard/Today.tsx`                                          | #2 (file already had uncommitted edits from the earlier perf pass) |
| `apps/web/src/design/tokens.css`                                                     | #3                                                                 |
| `docker/nginx.conf`                                                                  | #4, #5, #8                                                         |
| `apps/web/src/features/landing/MacBookShowcase.tsx`                                  | #6, #7                                                             |
| `apps/web/src/features/landing/Landing.tsx`                                          | #7 (file already had uncommitted edits)                            |
| `apps/web/scripts/showcase-variants.mjs` (new)                                       | #7; re-run when screenshots change                                 |
| `apps/web/public/images/product-showcase/*-720.webp`, `*-1440.webp` (36 new, 1.2 MB) | #7                                                                 |
| `apps/web/src/shared-core/core/http/axiosConfig.ts`                                  | #9                                                                 |
| `.dockerignore`                                                                      | exclude `artifacts/`                                               |
| `artifacts/lighthouse/`                                                              | runner, aggregator, reports                                        |

## 6. Remaining issues

- **LeaveFlow contrast (landing, desktop only)**: inactive steps of the
  scroll-telling section sit at `opacity: 0.32` (1.6–2 : 1). The step being
  read is always full contrast, but faded text is still text. Raising it to
  4.5 : 1 removes the effect, so this needs a design decision; options: fade
  only the step label/number, or raise the floor to ~0.6 and accept a softer
  effect.
- **401 from `/refresh-token` on every signed-out page**: Chrome logs the
  failed request itself. Avoiding it means not asking for a session when there
  is none to find (e.g. a non-HttpOnly "has session" hint set at sign-in) or
  having the gateway answer "no session" with 200. Both change the auth
  contract; not done here.
- **Analytics CLS 0.08 (mobile)**: seen in Lighthouse in both sets on the
  fixture's empty state ("No data yet"); not reproducible with a layout-shift
  observer at 1× or 4× CPU. Below the 0.1 "good" threshold; left unconfirmed
  rather than changed blindly. Re-check with real data.
- **Mobile LCP ~2.4–2.9 s**: now dominated by the simulated 150 ms RTT and
  1.6 Mbps link fetching ~200 KB of gzip JS before the app renders (signed-in
  pages have no prerendered content). Further gains need smaller initial JS or
  server rendering of the shell — a larger change.

## 7. Production-only items (not verifiable locally)

- Production web is AWS Amplify (console-managed app `hrms-web`), not this
  nginx. Its rewrite rules still send deep links to `index.html`; pointing
  them at `/app.html` (keeping `/`, the prerendered `.html` pages and static
  files) gives production fix #4. **Not applied** — Amplify changes need
  explicit approval (see `cloudformation/amplify-rules.json`, `docs/seo.md`).
- CloudFront already serves HTTP/2+ and compression; check its caching of
  `/images/*` and whether HTML is `no-store` there (bfcache).
- Field data: compare CrUX / Search Console Core Web Vitals for praesto.in
  ~28 days after deploying.

## 8. Reproduce

```sh
# one-time: isolated Lighthouse
mkdir -p ~/Downloads/hrms-lighthouse-tool && cd ~/Downloads/hrms-lighthouse-tool
npm init -y && npm install lighthouse@13.5.0

# run (needs the stack up and the harness fixtures at
# ~/Downloads/hrms-react19-artifacts/harness/fixtures.mjs)
node <repo>/artifacts/lighthouse/run-lighthouse.mjs <repo>/artifacts/lighthouse/<set> 3 [routeRegex]
#   LH_MODES=mobile|desktop to restrict; LH_BASE / CHROME_PATH to override

# compare two sets (medians + failing audits)
node <repo>/artifacts/lighthouse/aggregate.mjs <repo>/artifacts/lighthouse/baseline <repo>/artifacts/lighthouse/after

# rebuild the web container after changes
docker compose -f docker-compose.dev.yml up -d --build web
```

Reports (HTML + JSON per run, `summary.csv`, `comparison.txt`):

- `artifacts/lighthouse/baseline/` — before (image kept as
  `ysam090/hrms-web:pre-lighthouse-20261102`, local only)
- `artifacts/lighthouse/after-pass1/` — intermediate (before the text-3 token change)
- `artifacts/lighthouse/after/` — final. The first privacy runs were disturbed
  by an external restart of `hrms-dev-web`/`hrms-dev-api-gateway` at
  05:31 UTC (Chrome error page, `robots.txt` fetch failure); they are kept in
  `after/disturbed-by-restart/` and were re-run.

Reports contain only fictional fixture data and public pages; no cookies,
tokens or employee data.

## 9. Checks

| Check                                                   | Result                                                                                                                                                   |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter web typecheck`                           | pass                                                                                                                                                     |
| `pnpm --filter web exec vitest run`                     | 23 files, 205 tests pass                                                                                                                                 |
| ESLint on changed files                                 | 0 errors (5 pre-existing `no-explicit-any` warnings)                                                                                                     |
| Prettier on changed files                               | clean                                                                                                                                                    |
| `nginx -t` (nginx:1.27-alpine)                          | pass                                                                                                                                                     |
| Production build (`docker compose … up -d --build web`) | pass; served assets checked for each change                                                                                                              |
| Smoke                                                   | landing carousel advances with all screens loaded; dashboard renders card + widgets; `/api`, `/health`, Socket.IO polling and WebSocket work over HTTP/2 |
