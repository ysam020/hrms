# Git Hooks

This project enforces code quality and consistency through two git hooks managed by [Husky](https://typicode.github.io/husky/). Hook scripts live in `.husky/` and are committed to the repository — every developer gets them automatically on install.

---

## Hooks Overview

| Hook            | Trigger                             | Checks                                         |
| --------------- | ----------------------------------- | ---------------------------------------------- |
| `post-checkout` | After switching/creating a branch   | Branch name (warning)                          |
| `pre-commit`    | Before a commit is created          | Branch name (hard block), Prettier auto-format |
| `commit-msg`    | After the commit message is entered | Commit message format                          |

---

## `post-checkout`

Runs after `git checkout` or `git switch`, including `git checkout -b`. Git has no pre-checkout hook, so this can't block branch creation — but it warns you immediately and tells you how to rename the branch before you make any commits.

```
$ git checkout -b hello

WARNING: Branch name 'hello' does not follow naming conventions.
         Commits on this branch will be blocked.

  Rename it now:
    git branch -m hello <type>/<description>
```

---

## `pre-commit`

Runs automatically before every commit.

### 1. Branch Name Validation

Branch names must follow the pattern `<type>/<description>`.

**Allowed types:**

| Type       | Purpose                             |
| ---------- | ----------------------------------- |
| `feat`     | New feature                         |
| `fix`      | Bug fix                             |
| `docs`     | Documentation changes               |
| `chore`    | Maintenance, dependency updates     |
| `refactor` | Code restructuring (no feature/fix) |
| `test`     | Adding or fixing tests              |
| `hotfix`   | Urgent production fix               |
| `release`  | Release preparation                 |

**Protected branches** (allowed without a prefix): `main`, `master`, `dev`, `develop`

**Examples:**

```
feat/google-oauth-login      ✓
fix/session-token-expiry     ✓
hotfix/payroll-calculation   ✓
release/2.1.0                ✓
my-new-feature               ✗  (no type prefix)
Feature/login                ✗  (uppercase not allowed)
```

### 2. Prettier Auto-Format

Runs `prettier --write` across the following and re-stages the changes automatically:

- `apps/`
- `packages/`
- `docker-compose*.yml`

Files excluded via `.prettierignore`: `dist/`, `node_modules/`, generated proto/prisma files, `*.d.ts`, logs, env files, lock files.

Formatting is applied silently — the commit always proceeds with correctly formatted code.

---

## `commit-msg`

Runs after you enter a commit message. Enforces the [Conventional Commits](https://www.conventionalcommits.org/) specification.

### Format

```
<type>[optional scope]: <description>
```

### Allowed Types

| Type       | Purpose                                  |
| ---------- | ---------------------------------------- |
| `feat`     | New feature                              |
| `fix`      | Bug fix                                  |
| `docs`     | Documentation changes                    |
| `chore`    | Maintenance, dependency updates          |
| `refactor` | Code restructuring (no feature/fix)      |
| `test`     | Adding or fixing tests                   |
| `style`    | Formatting, whitespace (no logic change) |
| `perf`     | Performance improvements                 |
| `ci`       | CI/CD configuration                      |
| `build`    | Build system changes                     |
| `revert`   | Reverting a previous commit              |

### Examples

```
feat: add Google OAuth login                     ✓
fix(auth): handle expired session tokens         ✓
chore: update pnpm lockfile                      ✓
docs(api): document attendance endpoints         ✓
refactor(salary): simplify component calculation ✓

added new login flow                             ✗  (no type)
feat - add login                                 ✗  (wrong separator)
FEAT: add login                                  ✗  (uppercase)
```

### Bypassed Automatically

Merge commits (`Merge ...`) and revert commits (`Revert ...`) skip validation.

---

## Setup

Hooks are installed automatically when you run `pnpm install` at the repo root. No manual steps needed.

```bash
# From the repo root (monorepo/)
pnpm install
```

The `prepare` lifecycle script in `package.json` runs `husky`, which wires up the hooks.

**If hooks stop working** (e.g. after a fresh clone):

```bash
pnpm install   # or: npx husky
```

**To bypass a hook in exceptional cases** (use sparingly):

```bash
HUSKY=0 git commit -m "..."
```
