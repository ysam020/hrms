# Web app performance pass (apps/web)

November 2026, branch `feature/react-19-migration`. Every number below was measured on production builds of `apps/web`, before and after this work, with the browser harness in `~/Downloads/hrms-react19-artifacts/harness`. That harness uses fixtures only: no backend and no production data. Chromium was CPU-throttled 4× and Reduce Motion was on.

## Results

### Interactions (`renders.mjs`, median of 5)

"Renders" is the number of components whose render function ran during the interaction. It is counted the same way React DevTools' profiler counts.

| Interaction                           | Renders before | Renders after | Script before | Script after |
| ------------------------------------- | -------------: | ------------: | ------------: | -----------: |
| Audit log search, 200 events, 6 keys  |          6,216 |            54 |         75 ms |        17 ms |
| Leave applications search, 6 keys     |          1,773 |           272 |         44 ms |        19 ms |
| KYC search, 6 keys                    |          1,168 |           131 |         30 ms |        18 ms |
| Employee search, 6 keys               |          1,096 |           129 |         25 ms |        16 ms |
| Leave status filter                   |            584 |           185 |         29 ms |        22 ms |
| Employee list, next page              |            275 |            88 |         12 ms |         9 ms |
| Approvals → Today (dashboard mount)   |            817 |           391 |         74 ms |        62 ms |
| Today → Approvals                     |            575 |           308 |         43 ms |        42 ms |
| Command palette, open and type 5 keys |            278 |           133 |         37 ms |        35 ms |
| Org chart search, 6 keys              |             66 |            51 |         16 ms |        15 ms |

No scenario had a long task, before or after.

### Page loads (`perf-routes.mjs`, median of 7, cold context)

| Scenario      | Settled before | Settled after | Script before | Script after | Heap before | Heap after |
| ------------- | -------------: | ------------: | ------------: | -----------: | ----------: | ---------: |
| Dashboard     |         531 ms |        523 ms |        194 ms |       183 ms |      7.2 MB |     6.8 MB |
| Leave list    |         469 ms |        450 ms |        188 ms |       185 ms |      7.0 MB |     6.7 MB |
| Employee list |         465 ms |        468 ms |        172 ms |       170 ms |      6.3 MB |     6.2 MB |

Loads are essentially unchanged. The gains are in interactions.

### Bundle (`bundle-report.mjs`)

|                    |   Before |    After |
| ------------------ | -------: | -------: |
| All JS, gzip       | 743.6 KB | 826.8 KB |
| Initial load, gzip | 263.4 KB | 280.1 KB |

React Compiler adds memo-cache code to every component it compiles. Initial load is 16.7 KB (6%) larger. Excluding the landing page from the compiler (see below) brought this down from +24 KB.

### Other checks

- **API (`api-audit.mjs`, 56 signed-in screens):** 414 requests before and after, with no duplicates and nothing aborted. The two deeper request chains are real data dependencies:
  - dashboard layout → widget data;
  - employee → their assets.
- **Visual (`capture.mjs` + `compare.mjs`, desktop and mobile):** 117 of 118 screenshots were pixel-identical. The one difference (16 px on the mobile landing page) was gone on a re-capture: both builds then matched pixel for pixel.
- **View transitions (`vt-probe.mjs`):** all 14 scenarios pass.
- **Unit tests:** 205 pass (199 existing + 6 new in `src/__tests__/performance.test.tsx`).
- **Static checks:** typecheck clean; lint 0 errors.

## What changed

### React Compiler

- **Packages:** `babel-plugin-react-compiler` 1.0.0 (the latest stable) and `@rolldown/plugin-babel` 0.2.4. Both are wired through `@vitejs/plugin-react`'s `reactCompilerPreset`, in `vite.config.ts` (`reactCompiler()`).
- **Tests:** `vitest.config.ts` uses the same preset, so tests run compiled code.
- **Landing page excluded:** `src/features/landing/**` is left uncompiled. The page is prerendered and animates through motion values outside React, and every visitor downloads it first.
- **Coverage:** 379 components and hooks compile. 97 are skipped and left exactly as written; the compiler never fails the build. Reasons for skipping:
  - **Compiler 1.0 limitations (most of them):** a `?.`, `??` or ternary inside `try`; `try … finally`; `??=`; dynamic `import()`.
  - **Rule violations:**
    - refs read during render (`offline/drafts.ts`, `ui/RichText.tsx`, `walkthrough/Runner.tsx`);
    - hooks called in a callback (`features/org/OrgTree.tsx`);
    - `eslint-disable` of hooks rules (`useGet`, `useFetchData`, `MyMonth`, `Abilities`, `Apply`, `OrgSetup`, `PlatformTicket`).

  To see the current list, run the react-hooks compiler rules: every rule in `eslint-plugin-react-hooks` except `rules-of-hooks` and `exhaustive-deps`.

Skipped components on hot paths were restructured so they compile:

- **`ui/controls.tsx` (Button):** the long-press ref is reset inside its hook (`consumeLongPress()`).
- **`shell/AppShell.tsx` and `ui/Page.tsx`:** storage reads and writes moved to module functions.
- **`ui/layers.tsx`, `ui/pickers.tsx` and `ui/overlays.tsx`:**
  - no ref writes or variable reassignment during render;
  - no `eslint-disable`;
  - the date picker sets its cursor when it opens, instead of in an effect.
- **`features/dashboard/personal.tsx`:**
  - exact callback dependencies;
  - the month ribbon is keyed by the date string, not a fresh dayjs object;
  - no `eslint-disable`.
- **Lists:**
  - `Employees` and `TeamAttendance` handle errors with a promise `.catch`;
  - `LeaveApplications` moved its decision request into `decide()`.
- **Fourteen save handlers:** `finally` moved after `try/catch`. This was applied only where both blocks always complete normally, so behaviour is unchanged, and only where it lets that component compile.

Manual `useMemo`/`useCallback` were left in place: the compiler preserves them, and removing them adds churn without a measured gain. The one `memo()` added is `DataRow`, below.

### Table rows

`ui/Table.tsx` renders each row through a memoised `DataRow`. A row whose data, columns and state haven't changed skips rendering when the table re-renders. This is where the audit log win comes from (6,216 → 54 renders): filtering keeps the same row objects. A row still re-renders when its data, the columns or the selection change.

### Debouncing

`useDebouncedCallback(fn, delay)` in `lib/hooks.ts`:

- the latest `fn` runs once, `delay` ms after the last call;
- it is stable across renders;
- a pending run is dropped on unmount or `.cancel()`.

It replaces the hand-rolled timers in `usePagedList`, `LeaveApplications`, `TeamAttendance` and `Employees`, all at 300 ms as before. `LeaveApplications` and `TeamAttendance` didn't clear their timer on unmount: leaving the page mid-typing still sent a search request. That is fixed.

Not debounced, deliberately: approve, reject, punch, payments and other actions. `ui/Button` already blocks a second press while an async handler is pending.

### Stale responses

Chat's people search aborts the previous request when the query changes, so a slow answer for an old query can no longer replace newer results. The other searches were already covered:

- `useServerPagination` ignores all but the latest request;
- `UserCombobox` checks request order;
- the HTTP client supersedes identical GETs.

### Scroll and resize

Popovers (`ui/overlays.tsx`) and the people combobox (`ui/UserCombobox.tsx`) re-measure on every scroll and resize while open, but now re-render only when the position actually changes (`sameStyle` in `ui/layers.tsx`). The landing page's scroll and pointer handlers were already passive and frame-throttled, so they were left alone.

## Looked at, not changed

- **Virtualization:**
  - every table except the audit log is server-paginated at 25 rows;
  - the audit log is capped at 200 events by the gateway;
  - after the row memo, typing in it costs about 3 ms per keystroke at 4× throttle.

  Adding a virtualization library isn't justified by these measurements.

- **Context providers:** they sit under `AppShell`, which renders once, and re-render only on their own state changes. Memoising their values would save nothing measurable.
- **Images:** they already have lazy loading and intrinsic sizes where it matters.
- **Charts:** they are hand-rolled SVG, and no chart interaction showed up in the measurements.
- **Code splitting:** every route is already lazy. The 646 KB face-api/TensorFlow chunk loads only when someone punches in with face verification.

## Recommendations (not done)

1. **Signed-in deep links download the landing page.** The host serves the prerendered `index.html` for every path, so `/dashboard` also preloads `Landing` (26 KB gzip JS, 10 KB CSS). A separate app-shell HTML for app routes would avoid this. That is a hosting rewrite change; see the Amplify rules notes before touching it.
2. **`useServerPagination` has a dormant IndexedDB page cache** (`cacheKey`). No caller enables it, and it isn't scoped by tenant or user. Remove it, or scope it, before anything turns it on.
3. **Revisit the skipped components when a compiler release supports `try/finally` and conditionals inside `try`.** Most of the remaining 97 would then compile with no code change.

## Reproducing

```sh
cd apps/web && pnpm build && cp -R dist ~/Downloads/hrms-react19-artifacts/dist-perf-after
cd ~/Downloads/hrms-react19-artifacts/harness
node renders.mjs before=../dist-perf-before after=../dist-perf-after 5
node perf-routes.mjs before=../dist-perf-before after=../dist-perf-after 7
node bundle-report.mjs before=../dist-perf-before after=../dist-perf-after
node api-audit.mjs after ../dist-perf-after
node capture.mjs a ../dist-perf-before desktop,mobile && node capture.mjs b ../dist-perf-after desktop,mobile && node compare.mjs a b
node vt-probe.mjs after ../dist-perf-after
```
