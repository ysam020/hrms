# Shared-element view transitions

Navigations between related screens keep an entity's identity on screen: a person's avatar and name grow out of the row that opened their profile; a job's title and status move into its header; dashboard approval rows become the rows of `/approvals`.

## How it works

- React Router 6's data router runs each navigation made with `TransitionLink`, `TransitionNavLink` or `useTransitionNavigate` inside `document.startViewTransition`. Under Reduce Motion, or in browsers without the API, navigation is instant and nothing else changes.
- The page region cross-fades (`px-page`, `shell/shell.module.css`). Elements that carry the same `view-transition-name` on both screens **morph** instead: the browser moves and resizes them from old to new.
- All helpers live in `src/motion/viewTransition.tsx`; per-part styling lives in `src/design/base.css` (`.px-vt-avatar`, `.px-vt-title`, `.px-vt-heading`, `.px-vt-row`, `.px-vt-badge`).

React 19.3's `<ViewTransition>` component isn't used. It animates transitions React starts itself, while React Router 6 starts and commits these navigations on its own. Adopting it would mean moving to React Router 7's `useTransitions` mode.

## Adding a list → detail transition

1. **Pick a key both screens know.** Use the value the detail route is keyed by (username, ticket id, `userId`).
2. **Source row: name parts only while navigating to or from that detail.**
   ```tsx
   const on = useTransitionWith(`/things/${row.id}`);
   <PrimaryCell
     title={row.title}
     titleStyle={sharedPart("thing", row.id, "title", on)}
   />;
   ```
   Names must be unique in a snapshot. Never name every row permanently.
3. **Hand over what the row shows** in the click that navigates:
   ```tsx
   onRowClick={(row) => {
     handOff("thing", row.id, { title: row.title, status: row.status });
     navigate(`/things/${row.id}`);
   }}
   ```
4. **Detail page: render the shared parts from the hand-off while loading.**
   ```tsx
   const preview = useHandoff<ThingSummary>("thing", id);
   {loading && !thing && preview ? <ThingHeader id={id} thing={preview} /> : ...}
   ```
   Detail pages fetch after mount. Without the preview, the browser captures a skeleton and the element only fades out. The hand-off lives in memory only, belongs to the signed-in tenant and user, expires after 10 s and is cleared on sign-out. The page still fetches and authorises the full record. On a direct visit there's no preview and the page renders exactly as before.
5. **Detail page: name the same parts permanently** (`sharedPart("thing", id, "title")`): one entity per page.

## Rules

- Name the element whose box should move: a title line, an avatar, a badge. Never a whole full-width wrapper unless the whole row really travels.
- Name a block or atomic box. Inline text inside an ellipsis container should take the name on its block (`PrimaryCell`'s `titleStyle`), not on a wrapper span.
- If the same entity can appear twice on a screen (org chart), mark the clicked instance with `markTransitionSource(key)` and name only when `transitionSource() === key`.
- Lists that stagger rows in (`StaggerList`) skip that entrance while a transition arrives, so rows are captured visible.
- Verify with the browser harness: an expected name must show both old and new snapshots (a morph). A name present only in the old snapshot means the destination wasn't ready.

## Current pairs

| From                         | To                                   | Shared                                         |
| ---------------------------- | ------------------------------------ | ---------------------------------------------- |
| Today, "Needs Your Decision" | `/approvals`                         | widget heading → page title; each approval row |
| Today, any widget link       | its page                             | widget heading → page title                    |
| `/approvals` KYC row         | `/view-kyc/:username`                | avatar                                         |
| Employee directory           | `/employee-management/:username`     | avatar, name                                   |
| Organization chart           | `/employee-management/:username`     | avatar, name                                   |
| KYC list                     | `/view-kyc/:username`                | avatar, name                                   |
| Job openings                 | `/view-job-opening/:id`              | title, status                                  |
| Helpdesk                     | `/helpdesk/:id`                      | title, status                                  |
| Support tickets              | `/support/tickets/:id`               | subject, status                                |
| Salary management            | `/payroll/salary-management/:userId` | name → page title                              |
| Tax declarations             | `/payroll/tax-declarations/:userId`  | name → page title                              |
| Profile sections             | Profile sections                     | identity stays still                           |
