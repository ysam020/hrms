# Contributing

---

## Git Conventions

This repo enforces conventions via **Husky** git hooks. The hooks run automatically; no manual setup is needed after `pnpm install`.

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
feat/leave-balance-api
fix/session-expiry-on-refresh
chore/update-pnpm-lockfile
refactor/salary-component-helpers
docs/api-reference
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
feat: add WebAuthn passkey registration
fix(auth): clear refresh token cookie on logout
docs(api): document recruitment endpoints
chore: upgrade PrimeReact to v10
refactor(salary): extract net-pay calculation helper
test(leave): add integration tests for leave balance
perf(analytics): cache workforce aggregation result
```

### Allowed types

`feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `style`, `perf`, `ci`, `build`

### Rules

- Use the **imperative mood** in the description: "add" not "added", "fix" not "fixed"
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

| Hook            | Trigger                         | What it does                                                   |
| --------------- | ------------------------------- | -------------------------------------------------------------- |
| `post-checkout` | After branch switch             | Warns if new branch name is invalid                            |
| `pre-commit`    | Before commit is created        | Validates branch name; auto-formats staged files with Prettier |
| `commit-msg`    | After commit message is written | Validates Conventional Commits format                          |

### Bypassing hooks (emergency only)

```bash
HUSKY=0 git commit -m "hotfix: emergency patch"
```

Use sparingly. The hooks exist to keep the commit history clean and the codebase consistently formatted.

---

## Development Workflow

1. **Create a branch** from `main` or `dev` using the naming convention above.
2. **Make changes** — write code, add tests if applicable.
3. **Stage your files** — `git add <files>` (avoid `git add -A` to prevent accidentally staging secrets).
4. **Commit** — the pre-commit hook formats staged files; the commit-msg hook validates the message.
5. **Push** and open a pull request against `main` (or `dev` for feature branches).
6. **Pass CI** — linting, build, and tests must all pass.
7. **Request review** — at least one approval required before merging.

---

## Adding a New Feature

### Backend: new endpoint

1. Add or update the `.proto` definition in `packages/proto-definitions/src/proto/`.
2. Run `pnpm proto:gen` to regenerate TypeScript types.
3. Implement the handler in the relevant microservice.
4. Add the REST route in `apps/api-gateway/src/routes/`.
5. Add the handler function in `apps/api-gateway/src/handlers/`.

### Backend: new database field

1. Update `packages/database/src/prisma/schema.prisma`.
2. Run `pnpm db:generate` (updates the Prisma client).
3. Run `pnpm db:push` (applies the change to the database).
4. If the field is sensitive (PII), add it to the encryption list in `@hrms/crypto`.

### Frontend: new page

1. Create `apps/web/src/features/<domain>/` with component(s), hook(s), and API call(s).
2. Add the route in `apps/web/src/app/App.tsx`.
3. Add a navigation link in the sidebar component.

---

## Code Style Guidelines

- **TypeScript** everywhere — no `any` types without a comment explaining why.
- **Allowlist over denylist** — when accepting user input to update a database record, explicitly list the fields you accept; never spread `req.body` directly.
- **No global error swallowing** — always log errors with context before re-throwing or returning an error response.
- **Consistent response shape** — use `apiResponse()` from `@hrms/common` in all gateway handlers.
- **No magic strings** — use constants from `@hrms/constants` for status values, role names, etc.
- **Sensitive fields** — any new PII field must use `aesEncrypt`/`aesDecrypt` from `@hrms/crypto`.
