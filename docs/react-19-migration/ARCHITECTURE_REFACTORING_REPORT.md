# Architecture Refactoring Report

**Scope of this branch:** one complete exemplar (the largest god file), the lint rules that keep hooks honest, and a measured backlog for the rest. The app is ~66,000 lines across 33 feature folders. A rewrite in one pass would put the "UI unchanged" guarantee at risk, so the refactor is incremental, and every step is verified by the visual and functional comparisons.

## Done: `features/attendance/Attendance.tsx` (1,686 → 91 lines)

Before, one file held five screens (my month, team attendance, corrections, leave applications, apply leave), with their HTTP calls, permission rules, validation and form state inline.

```
features/attendance/
  Attendance.tsx            the five route pages (91 lines; same exports, so the router is unchanged)
  components/
    MyMonth.tsx             my month calendar strip and summary
    TeamAttendance.tsx      all-attendance table
    Correction.tsx          attendance correction form
    LeaveApplications.tsx   leave list: filters, selection, decisions (UI + orchestration)
    ApplyLeave.tsx          apply-leave form and duration picker
  services/
    leaveService.ts         list / update / bulk-update — HTTP and response normalisation
  utils/
    leaveRules.ts           canManageLeaves / canActOnLeave — pure, no React
  Insights.tsx              (unchanged)
```

- **The JSX moved verbatim.** Each component's render output is byte-for-byte the same code. The 156 screenshots, 18 interactive states and DOM facts are identical before and after.
- **The leave list no longer talks HTTP or permissions directly.** `leaveService` owns endpoints, query building and envelope handling (`success: false` → error with the server's message). `leaveRules` owns who may approve or withdraw. Messages, alerts and control flow in the component are unchanged.
- **Testable without rendering:** `__tests__/leaveModules.test.ts` covers the rules (owner, manager, self-request, superuser) and the service (exact query string, `success: false`, bulk outcome shape).

**Next increments in the same module** (same pattern; each needs a visual re-check):

- `Correction.tsx` (5 direct client calls) → `attendanceService.correct()`.
- `TeamAttendance.tsx` (4) and `MyMonth.tsx` (3) → `attendanceService.list*()`.
- `ApplyLeave.tsx` (3) → `leaveService.apply()`, keeping `sendOrQueue` for offline.

## Done: hook rules enforced

The repo's ESLint config loaded `eslint-plugin-react-hooks` but enabled **no** rules, so the 36 `eslint-disable … exhaustive-deps` comments suppressed nothing. Now `rules-of-hooks` and `exhaustive-deps` are errors for `apps/web/**`:

| Finding                                                                          | Fix                                                                                                 |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `rules-of-hooks`                                                                 | 0 violations                                                                                        |
| `session.tsx` (3 effects) — stable `navigate` / `setSessionUser` undeclared      | Declared; no re-runs (identities are stable)                                                        |
| `useChat` — callback read `user?.id` without depending on it                     | Declared; a different user now gets fresh conversations                                             |
| `KycForm` — `?? {}` defeated a memo every render                                 | Module-level empty constant                                                                         |
| `walkthrough/Runner.tsx` (2) — `wt` used only in type positions                  | `TourState` type alias                                                                              |
| `ui/overlays.tsx` — `ref.current` read in cleanup                                | Kept (deliberate: return focus only if focus is still inside at close time); documented suppression |
| `useFetchData` — spread `deps`                                                   | Kept (caller-supplied deps are the hook's API); documented suppression                              |
| 2 suppressions that suppressed nothing (`landing/motion.tsx`, `useApiClient.ts`) | Removed (plus the one in `session.tsx`, replaced by `useEffectEvent`)                               |
| `session.tsx` 402 handler + render-time `userRef` write                          | Replaced with `useEffectEvent`                                                                      |

**Remaining:** 35 suppressions (36 before; 3 removed, 2 justified ones added), each a real stale-closure trade-off. They are now _visible_ debt rather than silent. Clearing them is the main refactoring backlog (below).

## Also found (not changed in this branch)

- **The repo's TypeScript lint rules are not active.** `eslint.config.js` spreads `tseslint.configs.recommended.rules`, which doesn't exist (`configs.recommended` is an array), so no `@typescript-eslint` rule runs, including unused variables. Fixing it repo-wide will surface many findings in backend packages too, so it's a separate change.

## Backlog: god files by size and coupling

Thresholds used for review (prompts, not hard limits): a component file over ~400 lines, more than ~6 `useState` in one component, direct `apiClient` calls in a component, or more than one screen per file.

| File                                                                                                                               | Lines   | Shape                                         | Suggested split                               |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------- | --------------------------------------------- | --------------------------------------------- |
| `features/landing/Landing.tsx`                                                                                                     | 1,491   | Marketing sections                            | Per section (no business logic; low priority) |
| `features/public/Apply.tsx`                                                                                                        | 1,369   | Public application form + upload + validation | form steps / `applyService` / schema          |
| `features/recruitment/JobEditor.tsx`                                                                                               | 1,284   | Editor + pipeline + API                       | sections / `jobService` / schema              |
| `features/recruitment/JobDetail.tsx`                                                                                               | 1,166   | Detail + candidates + actions                 | tabs / `candidateService`                     |
| `features/permissions/Permissions.tsx`                                                                                             | 1,096   | Roles, users, teams screens                   | per screen / `permissionsService`             |
| `features/payroll/Payroll.tsx`                                                                                                     | 1,089   | Payslips, advances, runs                      | per screen / `payrollService`                 |
| `features/dashboard/widgets.tsx`                                                                                                   | 1,024   | ~20 widgets                                   | one file per widget (registry already exists) |
| `features/settings/ExitAndPayroll.tsx`                                                                                             | 1,017   | Two settings screens                          | per screen                                    |
| `features/payroll/Tax.tsx`                                                                                                         | 1,014   | Declaration + review                          | per screen / `taxService`                     |
| `features/resignations/Resignations.tsx`                                                                                           | 1,012   | List + process + dialogs                      | list / process / `resignationService`         |
| `features/settings/Company.tsx`, `public/OrgSetup.tsx`, `chat/Chat.tsx`, `subscription/Subscription.tsx`, `settings/OrgPolicy.tsx` | 878–993 | Mixed                                         | Same pattern                                  |

**Coupling:** 184 direct `apiClient` calls remain inside feature components (`.tsx`), down from 187; the 3 leave-list calls moved into `services/leaveService.ts`. The service pattern in `features/attendance/services/` is the template.

**Process for each file**, the same one used here:

1. Move components verbatim into `components/`.
2. Extract HTTP into `services/` and rules into `utils/`, without changing messages.
3. Add unit tests for the extracted modules.
4. Rerun the visual and functional harness, and accept only identical results.
