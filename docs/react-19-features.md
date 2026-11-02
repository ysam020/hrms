# React 19 features in apps/web

Status as of 2026-11-02. apps/web already ran React 19.3 with the React Compiler
(commit 7dc864e); this pass adopts React 19 APIs where they fix a real problem.
Tests: `src/__tests__/react19Features.test.tsx`.

## What changed

| Feature                        | Where                                                                                                                                                             | Why                                                                                                                                                                                                                 |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useOptimistic`                | Approvals (page and Today widget), helpdesk ticket status and replies, notification clearing                                                                      | Decisions no longer hold a modal for the round trip; a ticket's new status shows at once; the old notification rollback restored a stale snapshot (undoing a newer clear, dropping socket arrivals).                |
| Form Actions, `useActionState` | Resignation form (`ResignForm`)                                                                                                                                   | Error and pending state come from the action; `saving` state removed.                                                                                                                                               |
| Form Actions + `useFormStatus` | `SubmitButton` (ui/controls.tsx); attendance correction, resignation form                                                                                         | One busy/disabled/accessible-name source per form, read from the form itself.                                                                                                                                       |
| Ref as a prop                  | ui `TextInput`, `TextArea`, `Select`, `SearchField`, `AmountInput`, `Button`, `IconButton`, `Checkbox`; motion `ExitGuard`, `TransitionLink`, `TransitionNavLink` | `forwardRef` removed (deprecated path in React 19); public props unchanged.                                                                                                                                         |
| `<title>`                      | `Page`, Login, OrgSetup, ConnectAuthorize, careers `PublicBar`                                                                                                    | Titles are set in the commit, not an effect, and leave with the screen. `seo.ts` now writes only the document's own `<title>` and resets it to "Praesto" on app routes, so no screen keeps a previous page's title. |
| `preconnect` / `preload`       | `prepareRazorpay()` (billing.ts): OrgSetup plan step, Subscription page; punch flow (jsDelivr)                                                                    | Razorpay Checkout was fetched only after pressing pay (cold: ~150–210 ms connect + 51 KB). The face models' origin is now connected while the face-api chunk loads.                                                 |
| Root error callbacks           | `app/errorReporting.ts`                                                                                                                                           | Existing handlers hardened: no throw on odd values (`Object.create(null)`), no re-entrant reports, identical errors within 10 s reported once (production), a failing sink can't break the app.                     |

## Rules learned (keep these)

- Inside an Action or async transition, ordinary `setState` is held until the
  action ends; only optimistic updates show at once. Clear a chat composer in
  the submit handler, not in the action (helpdesk reply).
- Validation that must focus the first invalid field runs in `onSubmit`;
  `preventDefault()` there cancels the action (attendance correction).
- After a form action React resets the form; controlled fields keep their
  state (tested), uncontrolled ones are cleared.
- When the server confirms but the reload fails, write the confirmed value
  into base state before reloading, or the optimistic layer drops it
  (helpdesk ticket).
- `useFormStatus` reads only the enclosing `<form>`: dialog footers that
  submit with `form="id"` keep `Button busy={…}`.
- React's `<title>` goes ahead of index.html's; never set `document.title`
  while a screen renders one (it would edit React's node). Use
  `applyPageMeta`.
- React does not dedupe `<meta>`/`<link rel=canonical>` against index.html,
  so public meta stays in `seo.ts`.

## Not adopted, and why

- **Optimistic attendance correction**: it overwrites punches and spends a
  monthly allowance; there is no pending list to show it in.
- **Optimistic leave/WFH status, recruitment stage moves, platform tickets**:
  leave/WFH decisions already go through Approvals; recruitment calls carry
  emails and hire side effects; platform tickets use version-checked writes
  (409 on conflict), which an optimistic layer would hide.
- **useActionState elsewhere**: most forms clear each field's error as it is
  edited, or submit from a dialog footer outside the `<form>`, or (support
  composers) share pending state with an attachment picker. Converting them
  would add state, not remove it. Offline-capable forms (leave, WFH,
  helpdesk create, announcements) keep their queue-aware submit.
- **Suspense/lazy changes**: every route is already lazy (data-router
  `lazy`), heavy optional parts (walkthrough runner, map picker, face-api)
  are already split, and chunk-load failures already recover in `RouteError`.
  Data fetching is effect-based (`useGet`), not Suspense-enabled.
- **Font preloading**: the app uses the system font stack; there are no web
  fonts.
- **Remote error delivery**: there is no ingestion endpoint. Backend logs go
  to CloudWatch/Loki via `@hrms/logger`; delivering browser errors needs a
  gateway endpoint (rate-limited, redacted, size-capped) — a backend and
  security decision. `createErrorHandlers(sink)` takes the sink when it
  exists.

## Measurements (2026-11-02)

Built dist before/after, served locally; signed-in screens use the React 19
harness fixtures (`~/Downloads/hrms-react19-artifacts/harness`), never the
shared database. Gateway latency set to 1 s for the mutation timings.

| Interaction (1 s gateway)                         | Before      | After                      |
| ------------------------------------------------- | ----------- | -------------------------- |
| Approve: dialog dismissed                         | 1314 ms     | 23–42 ms                   |
| Approve: "Approving…" shown on the row            | none        | 24–49 ms                   |
| Approve: row removed (after server confirms)      | 1314 ms     | 1316–1331 ms               |
| Next request can be decided                       | 2101 ms     | 570–583 ms                 |
| Ticket status: new value shown                    | 1122 ms     | 154–157 ms                 |
| Clear A (fails) + clear B (succeeds) concurrently | B reappears | B stays cleared, A returns |

Lighthouse 13.5 (mobile, 3 runs, medians), routes landing, login, privacy,
dashboard, attendance, helpdesk: performance, LCP, TBT, CLS and accessibility
unchanged within run-to-run noise (e.g. dashboard LCP 4380 → 4377 ms, CLS
0.001 → 0.001; a11y 100 everywhere).

Bundle: initial JS +0.2 KB gzip (app.html) / +0.3 KB (landing); 125 chunks
before and after; SW precache unchanged (174 files, 2.4 MB).

Razorpay Checkout (curl, cold, this network): DNS+TLS 150–210 ms, total
230–290 ms for 51 KB, `max-age=120`. With the OrgSetup preload this happens
while the plan step is read, not after pressing pay; not measured end to end
(the checkout itself needs a live Razorpay session).
