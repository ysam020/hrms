# Praesto web app

The Praesto frontend (React 18, Vite, React Router data router). It talks to the API gateway and works offline for supported workflows; see [docs/offline-first.md](../../docs/offline-first.md).

## Run

The app uses the backend started by `pnpm dev` or the Docker dev stack (API gateway on `https://localhost:9002`).

```bash
pnpm --filter web dev        # https://localhost:5174
```

Point it at another gateway with `PRAESTO_API_PROXY=https://host:port`. `VITE_API_STRING` (default `/api/v1`) can be overridden the same way; the default lives in `vite.config.ts` because the repo ignores `.env.*` files.

The dev server runs **without** a service worker (it retires one left from an earlier build). To try offline behaviour, use a production build: see "Testing offline" in the offline document.

### Docker (dev stack)

The dev compose stack serves the production build at https://localhost (`web` service, `docker/web.Dockerfile`, nginx with `docker/nginx.conf`):

```bash
pnpm docker build dev web   # or `pnpm docker build dev` for everything
pnpm docker up dev
```

### Signing in

- **Google:** the gateway's OAuth callback returns to `CLIENT_URL`; set it to the origin you use.
- **Passkeys:** WebAuthn checks the origin. The `ORIGIN` secret (comma-separated) must include it, e.g. `https://localhost:5174` for the dev server.

## Scripts

```bash
pnpm --filter web typecheck
pnpm --filter web test:run
pnpm --filter web build      # typecheck (app + service worker), vite build, worker build, precache manifest
```

Lint uses the repo-wide config: `pnpm lint`.

## Layout

```
src/
  app/          router (lazy routes, access gates), session boot, navigation model
  design/       tokens.css (single source of design values), base.css, app.css
  motion/       motion tokens, presets, Presence/Collapse/Swap/Stagger, View Transitions
  ui/           components: controls, fields, pickers, overlays, table, page/inspector, icons
  shell/        AppShell, Sidebar, tab bar, ⌘K palette, notifications, appearance
  lib/          format, API helpers, hooks, usePagedList
  features/     one folder per module
  offline/      drafts, mutation queue, sync, resumable uploads, offline UI
  shared-core/  shared business modules: HTTP client, session providers, permissions,
                schemas, hooks, WebAuthn, billing constants (imported as "@web/…")
sw/             the service worker (Workbox), built to dist/firebase-messaging-sw.js
scripts/        inject-sw-manifest.mjs (precache manifest, run after the build)
```

`shared-core` came from the former Classic app and keeps its `@web/...` import paths; the app's own code is imported with `@next/...`.
