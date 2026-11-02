# React 19.3 Migration — apps/web

**Branch:** `feature/react-19-migration` (from `9bf62c6`, tagged `react18-baseline-20261101`)
**Date:** 2026-11-01
**Recommendation:** **CONDITIONALLY READY AFTER FIXES** (§7)

The existing Praesto web app now runs on **React 19.3.0 / React DOM 19.3.0** with the same UI. Across 52 screens × 3 viewports and 18 interactive states, the React 19 build's screenshots are pixel-identical to React 18's. The migration found and fixed two React 19 behaviour changes and two pre-existing bugs. It has not been tested against a running gateway, because the only local gateway uses the production database.

## 1. What changed

### Dependencies

| Package                   | Before            | After              | Where              |
| ------------------------- | ----------------- | ------------------ | ------------------ |
| react                     | ^18.3.1 (18.3.1)  | **19.3.0** (exact) | apps/web           |
| react-dom                 | ^18.3.1 (18.3.1)  | **19.3.0** (exact) | apps/web           |
| @types/react              | ^18.3.1 (18.3.28) | **19.3.0**         | apps/web           |
| @types/react-dom          | ^18.3.1 (18.3.7)  | **19.3.0**         | apps/web           |
| eslint-plugin-react-hooks | ^5.0.0 (5.0.0)    | **^6.1.1** (6.1.1) | root devDependency |
| scheduler (transitive)    | 0.23.2            | 0.28.0             | —                  |

**Unchanged on purpose:**

- **React Router 6.30.3.** Its peer range accepts React 19, and the app's page animations depend on its `viewTransition` integration. Moving to v7 is a separate decision (REACT_19_FEATURE_ADOPTION.md).
- **framer-motion 12.40, react-joyride 3.2.0, @testing-library/react 16.3.2.** Their peer ranges already include React 19; they are only re-keyed in the lockfile.
- **Vite 8.1.5, plugin-react 6.0.1, Vitest 4.1.2.** No React peer.

**Version facts (npm registry):** 19.3.0 was published 2026-09-09. 19.3.1 (2026-10-14) changes only the Server Components transport, which this client-rendered app never uses. Pinning the exact 19.3.0 prevents a silent drift to 19.3.1 or later.

**Lockfile:** `pnpm-lock.yaml` changed by +229/−14 lines: the apps/web and root importers, plus 15 new package entries (14 for the React 19 set, 1 for the hooks plugin). A plain `pnpm install` would have rewritten ~4,400 lines (pruning orphaned Classic-era entries, re-sorting importers, and drifting `@opentelemetry` peer resolution in api-gateway). Those changes were excluded. The result is Prettier-clean and passes `pnpm install --frozen-lockfile` from an empty `node_modules`. React 18 entries remain as unreferenced orphans and are not installed.

### Code (apps/web, root config)

| File                                                                                                                                   | Change                                                                                                          | Why                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `src/motion/Presence.tsx`                                                                                                              | `inertProps` → `inert: true`                                                                                    | **React 19 behaviour change:** React 19 treats `inert` as a boolean and drops `""`, so exiting overlays stopped being inert |
| `src/shell/AppShell.tsx`                                                                                                               | `inert={sidebarHidden \|\| undefined}`                                                                          | Same; the hidden sidebar stayed in the tab order                                                                            |
| `src/features/landing/motion.tsx`                                                                                                      | hook params `RefObject<T \| null>`                                                                              | React 19 types: `useRef<T>(null)` is `RefObject<T \| null>`; the hooks already null-check                                   |
| `AiAssistants.tsx`, `dashboard/data.ts`, `public/Apply.tsx`, `ui/controls.tsx`                                                         | `useRef<…>(undefined)`                                                                                          | React 19 types require an initial value                                                                                     |
| `features/auth/Showcase.tsx`                                                                                                           | `React.JSX.Element`                                                                                             | Global `JSX` namespace removed from @types/react 19                                                                         |
| `shared-core/shared/hooks/useServerPagination.tsx`                                                                                     | only the latest request may update state                                                                        | **Pre-existing bug:** a slower superseded response overwrote newer results                                                  |
| `src/app/session.tsx`, `shared-core/app/providers/UserContext.tsx`                                                                     | `endedByUser`; return path dropped after deliberate sign-out; `useEffectEvent` replaces a render-time ref write | **Pre-existing bug:** the next person was sent to the previous person's page                                                |
| `src/app/errorReporting.ts` (new), `src/main.tsx`                                                                                      | root `onCaughtError` / `onUncaughtError` / `onRecoverableError` with redaction                                  | React 19 error reporting; no tokens, emails or ID numbers in production logs                                                |
| `features/attendance/*`                                                                                                                | 1,686-line file split into pages + 5 components + `services/leaveService.ts` + `utils/leaveRules.ts`            | Architecture; JSX unchanged                                                                                                 |
| `KycForm.tsx`, `useChat.tsx`, `walkthrough/Runner.tsx`, `ui/overlays.tsx`, `useFetchData.tsx`, `useApiClient.ts`, `landing/motion.tsx` | hook-dependency fixes / documented suppressions                                                                 | Hooks lint now enforced for apps/web                                                                                        |
| `eslint.config.js`                                                                                                                     | `rules-of-hooks` and `exhaustive-deps` as errors for `apps/web/**`                                              | The plugin was loaded but no rule was on                                                                                    |
| `src/__tests__/react19Migration.test.tsx`, `leaveModules.test.ts` (new)                                                                | 12 regression/unit tests                                                                                        | Each regression test was shown to fail without its fix                                                                      |

Full diff: `git diff react18-baseline-20261101 -- apps/web eslint.config.js package.json pnpm-lock.yaml`.

## 2. Verification summary

| Check                                                                                                                   | Result                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clean install (`node_modules` removed, `--frozen-lockfile`)                                                             | ✅ React 19.3.0 / React DOM 19.3.0; no other React instance resolved by any React-dependent package                                                     |
| Typecheck (app + service worker)                                                                                        | ✅ 0 errors (16 type errors fixed)                                                                                                                      |
| Unit/integration tests                                                                                                  | ✅ **188/188** in 21 files (baseline 176/176 in 19)                                                                                                     |
| Lint (`pnpm lint`, repo-wide)                                                                                           | ✅ 0 problems, hooks rules enforced for apps/web                                                                                                        |
| Production build (typecheck → client → SSR prerender → service worker → precache)                                       | ✅                                                                                                                                                      |
| Visual regression: 52 screens × desktop/tablet/mobile                                                                   | ✅ **156/156 pixel-identical** (VISUAL_REGRESSION_REPORT.md)                                                                                            |
| Interactive states (dialogs, menus, validation, loading, error, dark, mobile)                                           | ✅ **18/18 identical**, DOM facts identical                                                                                                             |
| Functional flows (session, refresh, 401/402, CSRF, idempotency, sign-out, PWA offline, Socket.IO, passkeys, face punch) | ✅ identical to React 18, except the two intended fixes (FUNCTIONAL_REGRESSION_REPORT.md)                                                               |
| Performance                                                                                                             | ⚠️ +22.5 KB gzip initial JS; cold loads of signed-in screens +3–13% scripting/settle time at 4× CPU; interactions unchanged (PERFORMANCE_COMPARISON.md) |

## 3. Test environment and its limits

No safe non-production gateway exists: the local stack's MongoDB (`hrms-dev`) is the production database. All checks therefore ran against **production builds served locally**, with the **browser-side Playwright route intercepting `/api/v1/*`** and answering from fictional fixtures ("Halcyon Labs"). The app code was not modified for testing, and the same fixtures fed both builds.

This proves that the React 19 build behaves like the React 18 build given identical server responses. It does **not** prove anything about the gateway, data shapes the fixtures don't model, or production configuration.

## 4. UI differences

**None observed.**

- Pixel comparison found zero differing pixels across 175 screenshots (156 screens, 18 interactive states, 1 offline state).
- A repeat capture of the React 18 build was also 156/156 identical, so the harness itself contributes no noise.
- Non-visual output differences, documented: in the prerendered landing HTML, `useId` ids changed format (`:R1cb:` → `_R_1cb_`), and React 19's server renderer added a `<link rel="preload" as="image">` for the hero screenshot. Neither is visible; both are replaced when the client mounts.

## 5. Modules tested / not tested

All 34 areas were exercised at least visually; see FUNCTIONAL_REGRESSION_REPORT.md for the per-area matrix. **Not verified:**

- Against a real gateway.
- Google OAuth round-trip (external).
- Successful face recognition with a real face (the synthetic camera has none).
- FCM push delivery.
- File uploads to S3 (signed URLs).
- Org setup, careers application submit, and the walkthrough tour mid-run.
- The prerendered landing's SEO in a crawler.

## 6. Remaining blockers

1. **A non-production gateway with synthetic data**, then a run of FUNCTIONAL_REGRESSION_REPORT's flows against it. This is the main blocker.
2. Real-device checks: camera/face punch, passkeys on iOS/Android, push notifications.
3. A product decision on the cold-load regression: +22.5 KB gzip, and roughly +15–60 ms of scripting on a 4×-throttled CPU (PERFORMANCE_COMPARISON.md).

## 7. Recommendation

**CONDITIONALLY READY AFTER FIXES.**

- **Code-level readiness is high.** The UI is pixel-identical, every automated check passes, and the React 19 behaviour changes found (`inert`) are fixed and covered by tests.
- **Conditions before production:** blocker 1 (real-gateway verification), and the device checks in blocker 2.
- **Not done, by design:** nothing has been merged, deployed or pushed. Rollback is in ROLLBACK_PLAN.md.
