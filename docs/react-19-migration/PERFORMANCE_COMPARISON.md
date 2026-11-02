# Performance Comparison — React 18.3.1 vs React 19.3.0

**Summary:**

- **Initial JavaScript:** +22.5 KB gzip (+9%).
- **Cold load of signed-in screens:** +11–17 ms scripting and +9–11 ms long tasks at 4× CPU throttling; time to settled content is +3–13%.
- **In-app interactions:** unchanged (filtering, pagination).

React 19 is **not** faster for this app; it is slightly heavier on first load.

## Method

Same builds as the visual report. Both are served by the same local server and run in the same Chromium with the same fixtures. Each run uses a fresh browser context, builds alternate, 7 runs per scenario, and results are reported as median [p25–p75]. Conditions: 4× CPU throttle, 40 ms per API response, cache disabled. Lists use 25-row pages (the app's page size) over a total of 500. Chrome's own counters come from CDP `Performance.getMetrics` (ScriptDuration, LayoutDuration, TaskDuration). Long tasks come from a `PerformanceObserver`. Heap is `performance.memory`.

Scripts (outside the repo): `~/Downloads/hrms-react19-artifacts/harness/` — `bundle-report.mjs`, `perf-routes.mjs`, `timeline.mjs`.

## Bundle

| Build    | JS files | Total JS raw / gzip / br (KB) | CSS gzip (KB) | Initial load raw / gzip / br (KB) |
| -------- | -------- | ----------------------------- | ------------- | --------------------------------- |
| React 18 | 120      | 2,304.4 / 719.4 / 624.9       | 58.7          | 756.1 / 240.5 / 211.8             |
| React 19 | 120      | 2,383.1 / 742.2 / 644.0       | 58.7          | 834.4 / 263.0 / 230.7             |

The difference is almost entirely `vendor-react` (React, React DOM, router, scheduler): **70.1 → 91.9 KB gzip** (+21.8 of the +22.8 KB total). The remaining ~1 KB is spread across chunks that inline small React helpers (e.g. `vendor-motion` +0.3 KB, the entry chunk +0.4 KB). This matches the isolated measurement from the earlier experiment (React DOM 19.3 is ~+25 KB gzip over 18.3).

## Runtime

| Scenario                                           | Metric               | React 18                        | React 19      |
| -------------------------------------------------- | -------------------- | ------------------------------- | ------------- |
| Cold `/login` (signed out)                         | settled ms           | 249 [248–261]                   | 266 [262–266] |
|                                                    | scripting ms         | 112                             | 124           |
|                                                    | long tasks ms        | 60                              | 70            |
| Cold `/dashboard`                                  | settled ms           | 457 [454–457]                   | 518 [497–522] |
|                                                    | scripting ms         | 157                             | 175           |
|                                                    | long tasks ms        | 62                              | 71            |
| Cold leave list (25 rows)                          | settled ms           | 435 [433–435]                   | 472 [471–474] |
|                                                    | scripting ms         | 174                             | 185           |
| Cold employee list (25 rows)                       | settled ms           | 452 [426–455]                   | 466 [449–469] |
|                                                    | scripting ms         | 154                             | 170           |
| Switch leave filter (re-fetch + re-render 25 rows) | settled ms           | 104 [101–104]                   | 103 [99–114]  |
|                                                    | scripting ms         | 26.3                            | 27.1          |
| Employee list next page                            | settled ms           | 84 [77–85]                      | 86 [82–87]    |
|                                                    | scripting ms         | 9.5                             | 9.6           |
| All scenarios                                      | layout ms, FCP, heap | within noise (heap +0.1–0.2 MB) |               |

**Where the cold-load time goes:** request timelines for `/dashboard` (`timeline.mjs`) have the same order and the same waterfall on both builds. React 19 doesn't add a request round. Every step starts 15–35 ms later because the larger React DOM bundle takes longer to parse and execute before the first lazy chunk is requested. The dashboard's larger gap (+61 ms) accumulates over its three sequential request stages.

**Re-renders:** production builds carry no render counters. Chrome's scripting time during interactions (filter switch, pagination) is equal within 1 ms, which bounds any re-render difference to negligible.

## Interpretation

- The cost is a one-time, cold-load cost, in proportion to the framework bundle. It is roughly 4–15 ms on an unthrottled modern laptop (divide by ~4).
- Interactions after load are unaffected.
- The earlier experiment's micro-benchmark found React 19.3 slower when unmounting thousands of rows at once. With the app's 25-row pages, filtering and pagination show no difference. **Keep pagination at 25 rows** (unchanged in this branch).

## Profiling workflow (React Performance Tracks, 19.2+)

1. `pnpm --filter web dev` → Chrome DevTools › Performance › Record. The **Scheduler** and **Components** tracks show blocking vs transition work and which components rendered.
2. For production-like timings, alias `react-dom/client` → `react-dom/profiling` in a profiling build. Profiling builds emit the Scheduler track; production builds emit neither.
3. Re-run `perf-routes.mjs` before any later React, React Router or bundler upgrade and compare with this table.
