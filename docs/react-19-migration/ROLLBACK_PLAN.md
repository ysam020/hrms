# Rollback Plan

**Rollback point:** tag `react18-baseline-20261101` → commit `9bf62c6ab8d1bdac2b462694c906907b9bc47573` (React 18.3.1). The tag is local; push it with `git push origin react18-baseline-20261101` if the team wants it on the remote.

The migration touches only the frontend and lint configuration: no backend, API contract, database schema, Redis, queue, infrastructure or environment variable. **Rollback is therefore a frontend redeploy**, with no data step.

## Before release (branch not merged)

There is nothing to roll back: `main` and every deployed build are unaffected. To abandon the work:

```bash
git worktree remove ~/Downloads/hrms-react19      # the migration worktree
git branch -D feature/react-19-migration          # only if it is not needed for reference
```

## After merge, before deploy

```bash
git revert -m 1 <merge-commit>                     # or: git revert <commit>… for squash/rebase merges
pnpm install --frozen-lockfile                     # restores React 18.3.1 from the reverted lockfile
pnpm --filter web build && pnpm --filter web test:run
```

Check: `node -p "require('./apps/web/node_modules/react/package.json').version"` → `18.3.1`.

## After deploy (production frontend on Amplify)

1. **Fastest:** in the Amplify console, redeploy the last successful build from before the migration (Amplify keeps previous builds). No code change is needed. Expect minutes.
2. **Then:** revert the merge on `main` (as above) so the next automatic build doesn't reintroduce React 19.
3. **Service worker:** the precache manifest is content-hashed. Clients pick up the redeployed build through the normal service-worker update on their next visit. No cache purge is needed because the worker caches no API responses.
4. **Docker / dev stack** (`docker/web.Dockerfile`): rebuild the `web` image from the reverted commit (`pnpm docker build dev web`).

## What a rollback does not undo

Nothing persistent is migration-specific. One behaviour reverts with the code: after a sign-out, the next sign-in again returns to the previous person's page (the original behaviour). Error reports go back to React 18's default console output.

## Rollback triggers (staged rollout)

Roll back if any of these appears after release and doesn't have an obvious non-React cause:

- client error rate above the pre-release baseline (with the new root handlers, errors are reported once each);
- LCP or INP (p75) worse by more than 10% on signed-in screens; ~+5% is expected from the larger framework bundle;
- focus or keyboard issues in dialogs, menus or the hidden sidebar (the `inert` area of change);
- session anomalies: unexpected sign-outs, failed token refresh, 402 handling.

## Staged rollout (recommended once a staging gateway exists)

| Stage | Action                                                                                                                                             | Exit criteria         |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| 0     | Run the flows in FUNCTIONAL_REGRESSION_REPORT.md against a staging gateway with synthetic tenants; real-device checks (face punch, passkeys, push) | All green             |
| 1     | Deploy to an internal Amplify branch / staging URL; internal users for one week                                                                    | No rollback triggers  |
| 2     | Production deploy; keep the previous build ready to redeploy                                                                                       | 48 h without triggers |
