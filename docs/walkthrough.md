# Product walkthrough

Praesto has a guided product tour built on [react-joyride](https://github.com/gilbarbara/react-joyride) v3. It covers every module a person can open. Steps navigate between routes, wait for their targets, and save progress per person. People can start, pause, resume, restart, skip or finish a tour, and can also take a tour of one module.

Code: `apps/web/src/walkthrough/`. Server: `apps/api-gateway/src/handlers/walkthrough.ts`.

## How it fits together

| Piece             | File                                                                                       | Job                                                                                                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Types and version | `walkthrough/types.ts`                                                                     | Step and module schema, persisted state, `WALKTHROUGH_VERSION`                                                                                                                      |
| Engine            | `walkthrough/engine.ts`                                                                    | Pure functions: building a tour for a person, and every lifecycle transition (start, next, back, skip step, skip section, pause, dismiss, complete, restart, reconcile saved state) |
| Registry          | `walkthrough/registry.ts` + `walkthrough/tours/*.ts`                                       | Module definitions in tour order, plus `canReach` (access check)                                                                                                                    |
| Provider          | `walkthrough/WalkthroughProvider.tsx`                                                      | Owns the state, which is the single source of truth. Loads and saves it per tenant and user, and mounts the runner only while a tour runs                                           |
| Runner            | `walkthrough/Runner.tsx`                                                                   | Navigates, waits for targets, renders one controlled Joyride step                                                                                                                   |
| Target waiting    | `walkthrough/waitForTarget.ts`                                                             | MutationObserver plus a slow poll, with a time limit and cancellation                                                                                                               |
| Tooltip           | `walkthrough/Tooltip.tsx`                                                                  | Custom Joyride tooltip built from Praesto's own `Button`/`IconButton`                                                                                                               |
| Persistence       | `walkthrough/persistence.ts`                                                               | localStorage and server adapters, debounced saves                                                                                                                                   |
| Launchers         | `features/help/Tours.tsx`, `walkthrough/Launcher.tsx`, account menu in `shell/Sidebar.tsx` | Product Tours page (Help & Support → Product Tours, `/help/tours`), the first-run card on Today, and Resume Tour                                                                    |

The provider sits in `AppShell` inside `ShellContext`. While no tour is running, the app pays only for a context. The runner, Joyride and the step definitions load lazily the first time a tour starts.

### Why Joyride shows one step at a time

Joyride runs in controlled mode, with `stepIndex={0}` and a single resolved step, keyed by step id. The position lives only in the walkthrough state, as a stable step id rather than an index. The runner advances it by calling engine functions. Joyride never moves on by itself, so a route change can't race Joyride's index, and adding steps never shifts saved positions.

### What happens for each step

1. **Route.** If the current path isn't the step's route, `navigate(route)` with the app's router (no reload). Nothing is looked for until the route commits, because the old page has targets with the same generic names. If the route never commits (a redirect or a failed load), the step is skipped after 8 seconds.
2. **Prepare.** Run the step's optional `prepare` (safe UI only, such as showing a hidden sidebar).
3. **Wait.** `waitForTarget` checks the step's selectors in priority order until one is visible. "Visible" means connected, non-zero size, not inside `[inert]`, `[hidden]` or `[aria-hidden=true]`, and not `display:none` or `visibility:hidden`. The default limit is 6 seconds; a step can set `timeout`. A "Loading the next step…" pill with a Pause button appears after 400 ms, so the tour is never stuck.
4. **Show.** The tooltip is positioned against the viewport (`strategy: "fixed"`, flip and shift on both axes), so it never extends the page or ends up off screen. For a target taller than half the screen (a long table, the dashboard grid), the whole target is highlighted but the tooltip attaches to its top part, such as the header row or the first card (`anchorFor`). The anchor is scrolled to the middle of the screen only if it isn't already comfortably visible. Waiting skips loading skeletons (`aria-busy`). If the page replaces the target after it's shown (data finished loading), it's found again, and an error inside Joyride pauses the tour instead of breaking the page.
5. **Missing.** If the target doesn't appear, or the route showed NoAccess or NotFound (they render `data-tour-blocked`), the step is recorded as skipped. The tour moves on in the direction of travel, so Back over a missing step keeps going back.

If the person leaves a step's route themselves (a link or the back button), the tour **pauses**. It doesn't drag them back.

## Lifecycle and persistence

Each tour (`"app"` or a module id) has its own progress: `status` (`not_started` | `running` | `paused` | `completed` | `dismissed`), `stepId`, `seen[]`, `skipped[]`, `lastRoute` and `updatedAt`. `state.active` is the one tour that's running or paused. Starting another tour pauses the current one, and its progress is kept.

- **Next** marks the step seen. Next on the last step completes the tour.
- **Skip Step** marks only that step skipped. **Skip Section** skips the rest of the module (app tour only).
- **Pause** (×, Esc) keeps the position. **End Tour** sets `dismissed`, which is never `completed`, and the tour never starts by itself again.
- **Restart** clears `seen` and `skipped` and starts at step 1. Starting a completed tour also starts over.
- Saved progress is stored on the server (`GET/PUT/DELETE /walkthrough/progress`, model `WalkthroughProgress` in the tenant DB, unique per `tenantId` + `userId`). The tenant and user come only from the access token. The server rebuilds the state field by field (`sanitizeWalkthroughState`), with a 32 KB cap, id patterns and route checks.
- A localStorage copy under `px-walkthrough:<schema>:<tenantId>:<userId>` loads instantly and covers offline use and failed saves. The newer of the two copies wins, and a newer local copy is pushed up. Sign-out clears the local copy.
- **Refresh vs. new session.** A running tour comes back running only in the same tab: a `sessionStorage` marker records it. Anywhere else (a new tab, a later sign-in) it comes back **paused**. No one is ever put into a tour by signing in.
- Saves are debounced (800 ms) and flushed on pause, finish and `pagehide`. When the signed-in person changes, the old store is disposed and sends nothing more, because the API client would already carry the next person's token.
- Nothing in the state is sensitive. It holds statuses, step ids and a path, and never tokens or HR data.

## Roles, permissions and tenant features

`canReach(route, env)` allows a route only if it appears in `searchableNav(user)`. That uses the **same predicates** as the sidebar, ⌘K and the route gates in `router.tsx`: role, permission grants, `wfhEnabled` for the tenant, subscription access, and `isSupportAgent` for Praesto staff. `/profile` is the one extra route open to everyone. A step whose route isn't reachable is left out of the person's tour, and so is a module whose main route isn't. Steps are rebuilt whenever the user object changes (another organisation, new permissions) or the layout changes. The position is kept by id.

The Support Console step (`/platform/support`) only appears for Praesto staff. Organisation users never see it or its name. The tour is educational only: the server enforces every request as before, and the tour never grants anything.

## Adding steps for a new page

1. **Tag the targets.** Put a stable `data-tour="…"` on the elements you want to point at, never generated class names or text. Shared components already support it:
   - `Button`, `IconButton`, `SearchField` and inputs pass `data-tour` through.
   - `DataTable` and `SegmentedControl` take a `tour` prop. `DataTable` keeps it on its empty and error states too.
   - Generic targets already exist on every page: `page-title`, `page-tabs` (the filter row), `page-nav`, `notifications`. The sidebar has `nav-<moduleId>` for each NAV module, plus `sidebar-nav`, `sidebar-search` and `sidebar-account`. Insights pages have `insights-body`, and policy pages have `settings-body` and `settings-save`.
2. **Describe the module** in a file under `walkthrough/tours/`:

   ```ts
   {
     id: "expenses",              // match the NAV module id
     label: "Expenses",
     summary: "Claims and reimbursements.",
     route: "/expenses",          // must be a NAV path (or in OPEN_ROUTES)
     steps: [
       intro("expenses", "Expenses", "What it's for, where it lives."),
       { id: "new", target: "expenses-new", title: "Submit a claim",
         content: "…" },
       { id: "review", route: "/expenses/review", target: "expenses-table",
         placement: "top", title: "…", content: "…" },
     ],
   }
   ```

   - `intro(navId, …)` points at the sidebar entry, or at the page title where the sidebar isn't on screen.
   - `target` can be a list, tried in order. The first visible one wins.
   - `when(env)` adds a condition. `sidebar: true` limits a step to the docked sidebar. Use `timeout` for targets that may legitimately be absent (for example a button only some roles get), so they're skipped quickly.
   - Steps **never perform actions**. Don't click, submit or open dialogs to reveal a target; describe the control instead. `prepare` is only for safe UI such as showing the sidebar.

3. **List it** in the order array in `walkthrough/registry.ts`.
4. **Run the tests.** `walkthroughEngine.test.ts` checks that ids are unique and that every route exists in NAV.

### Step ids and versioning

The stable id is `<module>.<step>`. **Don't rename ids** that have shipped, because saved positions refer to them. Adding steps, removing steps and reordering are all safe. If a saved step disappears, the tour resumes at the start of its module, or else at the first step not yet seen. Bump `WALKTHROUGH_VERSION` when the sequence changes significantly; saved progress is reconciled by id, so a bump doesn't replay completed tours. Bump `STATE_SCHEMA` only when the persisted shape changes (the server checks it too).

## Accessibility

- The tooltip is a labelled dialog with `aria-labelledby` and `aria-describedby`. Joyride traps focus inside it, and focus starts on Next.
- ← and → move between steps, Esc pauses, and every control is a real button with a label.
- Progress is a `role="progressbar"` with `aria-valuetext`.
- Reduced motion turns off smooth scrolling and the progress animation.
- The overlay blocks clicks on the page (`blockTargetInteraction`), so pointing at a button can't trigger it by accident. Pausing removes the overlay at once.

## Deploying

The new `walkthrough_progress` collection needs its unique index in each tenant DB: `pnpm --filter @hrms/db db:migrate` (`push-to-all-tenants`). Until then, upserts still work but aren't protected against duplicate rows. Rebuild the gateway and web images as usual.
