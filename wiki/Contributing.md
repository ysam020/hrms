# Contributing

---

## Git Conventions

This repo enforces conventions via **Husky** git hooks. The hooks run automatically after `pnpm install` — no manual setup needed.

---

## Branch Naming

All branches must follow the pattern:

```
<type>/<short-description>
```

**Allowed types:**

| Type       | When to use                                |
| ---------- | ------------------------------------------ |
| `feat`     | New feature                                |
| `fix`      | Bug fix                                    |
| `docs`     | Documentation only                         |
| `chore`    | Build, tooling, dependency updates         |
| `refactor` | Code restructuring without behavior change |
| `test`     | Adding or updating tests                   |
| `hotfix`   | Critical production fix                    |
| `release`  | Release preparation                        |

**Examples:**

```
feat/tenant-settings-versioning
fix/session-expiry-on-refresh
chore/update-pnpm-lockfile
refactor/salary-component-helpers
docs/api-reference
feat/razorpay-grace-period
```

**Protected branches** (no prefix required): `main`, `dev`

The `post-checkout` hook warns if a branch name is invalid. It is a warning, not a hard block.

---

## Commit Messages

HRMS follows the **Conventional Commits** specification.

### Format

```
<type>[optional scope]: <description>
```

### Examples

```
feat: add time-versioned tenant settings
fix(auth): clear refresh token cookie on logout
docs(api): document tenant management endpoints
chore: upgrade Razorpay SDK to v2
refactor(db): extract tenant connection pool
feat(scheduler): add AI resume scoring job
perf(cache): add L1 LRU layer to CacheManager
```

### Allowed types

`feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `style`, `perf`, `ci`, `build`

### Rules

- Use the **imperative mood**: "add" not "added", "fix" not "fixed"
- No period at the end of the description
- Keep the description under 72 characters
- Add a body (blank line + paragraph) for any non-obvious "why"

The `commit-msg` hook validates the format and rejects non-conforming messages.

---

## Code Formatting

The `pre-commit` hook runs **Prettier** on all staged files before the commit is created. You do not need to format manually — just stage your changes and commit.

To format the entire codebase at once:

```bash
pnpm format   # Prettier --write + ESLint --fix
```

---

## Hooks Summary

| Hook            | Trigger                  | What it does                                                   |
| --------------- | ------------------------ | -------------------------------------------------------------- |
| `post-checkout` | After branch switch      | Warns if the new branch name is invalid                        |
| `pre-commit`    | Before commit is created | Validates branch name; auto-formats staged files with Prettier |
| `commit-msg`    | After message is written | Validates Conventional Commits format                          |

### Bypassing hooks (emergency only)

```bash
HUSKY=0 git commit -m "hotfix: emergency patch"
```

Use sparingly — hooks exist to keep the commit history clean and the codebase consistently formatted.

---

## Development Workflow

1. **Create a branch** from `main` or `dev` using the naming convention above.
2. **Make changes** — write code, add tests if applicable.
3. **Stage your files** — `git add <files>` (avoid `git add -A` to prevent accidentally staging `.env`).
4. **Commit** — the pre-commit hook formats staged files; the commit-msg hook validates the message.
5. **Push** and open a pull request against `main` (or `dev` for feature branches).
6. **Pass CI** — linting and build must pass.
7. **Request review** — at least one approval required before merging.

---

## Adding a New Feature

### Backend: new endpoint

1. Add or update the `.proto` definition in `packages/proto-definitions/src/proto/`.
2. Run `pnpm proto:gen` to regenerate TypeScript types.
3. Implement the handler in the relevant microservice (or directly in the gateway if the feature doesn't need a dedicated service).
4. Add the REST route in `apps/api-gateway/src/routes/`.
5. Add the handler function in `apps/api-gateway/src/handlers/`.
6. Add the endpoint to `API_ENDPOINTS` in `apps/web/src/shared/constants/apiEndpoints.ts`.

### Backend: new database field

1. Update `packages/database/src/prisma/schema.prisma`.
2. Run `pnpm db:generate` (updates the Prisma client).
3. Run `pnpm db:push` (applies the change to the database).
4. If the field holds PII, add `aesEncrypt`/`aesDecrypt` calls via `@hrms/crypto`.
5. If the field is on a **business model** (not `User`/`Tenant`/`TenantMembership`), it belongs in the tenant database — no further configuration needed; `prismaWithTenant` routes it automatically.

### Frontend: new page

1. Create `apps/web/src/features/<domain>/` with component(s) and hooks.
2. Add the route in `apps/web/src/app/App.tsx`.
3. Add a navigation link in the sidebar component.
4. Use `apiClient` from `@web/core/http/axiosConfig` and `API_ENDPOINTS` for API calls.
5. Use `setAlert` from `AlertContext` for user-facing success/error messages.

### New microservice

See [Microservices — Adding a New Microservice](Microservices#adding-a-new-microservice).

### New background job

See [Background Jobs — Adding a New Job](Background-Jobs#adding-a-new-job).

---

## Code Style Guidelines

- **TypeScript everywhere** — no `any` types without a comment explaining why.
- **Allowlist over denylist** — when accepting user input to update a database record, use an explicit field allowlist; never spread `req.body` directly onto a Prisma call.
- **Always use `handleError`** — all gateway handler `catch` blocks must call `handleError(res, err)` from `@hrms/common`. Never construct inline `apiResponse` calls in catch blocks — this bypasses Prisma error mapping (P2002→409, P2025→404).
- **Consistent response shape** — use `apiResponse()` from `@hrms/common` in all gateway handlers.
- **No magic strings** — use constants for status values, role names, subscription statuses, etc.
- **Sensitive fields** — any new PII field must be encrypted via `@hrms/crypto`. Add to the encryption list before merging.
- **Multi-tenant safety** — never query business models via the raw `prisma` client (master DB) unless explicitly operating on cross-tenant data. Always use `prismaWithTenant` for business data queries.
- **Subscription guard** — new business routes must be added to the `subscriptionGuard` array in `apps/api-gateway/src/routes/index.ts`.
- **API endpoint registry** — every new endpoint path must be added to `API_ENDPOINTS` in `apps/web/src/shared/constants/apiEndpoints.ts`. Never hardcode paths in components.
- **No global error swallowing** — always call `logger.error` with context before returning an error response.
- **Alert on error** — frontend `catch` blocks that affect the user must call `setAlert(message, "error")`. Don't silently swallow errors.
