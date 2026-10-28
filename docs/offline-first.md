# Offline-first in the Praesto web app

This describes what works without a connection, how it's built, the rules it follows, and how to test and deploy it. Code: `apps/web/sw/` (service worker), `apps/web/src/offline/` (everything else), `apps/api-gateway/src/middleware/idempotency.ts` and `apps/api-gateway/src/handlers/resumableUpload.ts` (server side).

## What works offline

After one successful online visit in a browser, Praesto:

- opens without a connection, on any in-app route (the app shell is precached);
- keeps the person signed in to an **offline mode** if they had a session on this device (see "Offline session mode");
- saves form drafts on the device as they're typed, restoring them after a reload or browser restart;
- queues submissions made offline and sends them, in order, once the gateway is reachable;
- uploads files chosen offline later, resuming from the parts the server has confirmed.

It does **not** show HR data that wasn't loaded in this session: no API response is cached (see "Caching"). Pages that list records show "You're offline" until the connection returns.

### Capability matrix

| Module                   | Opens offline | Data readable offline | Draft saved on device | Submission queued offline   | Conflicts                                                                              | Attachments                           |
| ------------------------ | ------------- | --------------------- | --------------------- | --------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------- |
| Leave › Apply for Leave  | Yes           | Form only             | Yes                   | Yes (`leave.create`)        | Append-only; server validation decides (e.g. overlap)                                  | Medical certificate: resumable upload |
| Work From Home › Request | Yes           | Form only             | Yes                   | Yes (`wfh.request`)         | Append-only                                                                            | —                                     |
| Helpdesk › New Ticket    | Yes           | Form only             | Yes                   | Yes (`helpdesk.ticket`)     | Append-only                                                                            | —                                     |
| Announcements › New      | Yes           | Form only             | Yes                   | Yes (`announcement.create`) | Append-only                                                                            | —                                     |
| Announcements › Edit     | Yes           | The copy being edited | Yes, per announcement | Yes (`announcement.edit`)   | **Detected**: `If-Match` on `lastUpdatedOn`; the person chooses Keep Mine / Use Theirs | —                                     |
| All other modules        | Yes (shell)   | No                    | No                    | No — online only            | —                                                                                      | —                                     |

Always online only, by design: signing in (Google, passkeys), passkey registration, payments and subscription changes, payroll runs and disbursement, approvals and other decisions that depend on current server state, permission and role changes, deletions, and attendance punches (they need live face verification and location).

## Architecture

```
Browser tab                                          Service worker (sw/sw.ts)
┌──────────────────────────────────────────┐        ┌──────────────────────────────┐
│ Forms ── useOfflineDraft ──► IndexedDB   │        │ precache: app shell          │
│   │            (drafts)                  │        │ navigations → index.html     │
│   └─ sendOrQueue ─┬─ online → API        │        │ fonts, images: cache-first   │
│                   └─ offline → queue ──► │        │ /api/*: not handled          │
│                       (mutations)        │        │ sync event → wake the tab    │
│ Sync coordinator ── API client (session) │◄──────►│ push notifications (FCM)     │
│ Resumable uploads ── S3 multipart        │        └──────────────────────────────┘
│ Status chip · Pending Changes sheet      │
└──────────────────────────────────────────┘
```

The queue is replayed **by the app**, through the same axios client as every other request, so the in-memory access token, refresh, CSRF and 401 handling are unchanged and no credential is ever stored. The service worker holds no credentials and makes no business or authorisation decisions; it only wakes the app for Background Sync.

## Service worker and Workbox

- **Source:** `apps/web/sw/sw.ts`, typechecked with `tsconfig.sw.json`.
- **Build:** `vite.sw.config.ts` bundles it to `dist/firebase-messaging-sw.js` (the URL the old worker used, so existing registrations update in place and push keeps working). Then `scripts/inject-sw-manifest.mjs` runs `workbox-build`'s `injectManifest` to write the precache list.
- **Modules used:** `workbox-precaching`, `workbox-routing`, `workbox-strategies`, `workbox-expiration`, `workbox-cacheable-response`, `workbox-core`; `workbox-window` for registration.
- **Registration:** production builds only (`src/offline/register.ts`). The dev server serves a stand-in worker (`public/firebase-messaging-sw.js`) that clears caches and unregisters itself.
- **Updates:** a new version installs and waits. If it's found while the app is starting and nothing is being edited, the app switches immediately; otherwise "Update available" appears in the status chip and the Pending Changes sheet. The Reload button is disabled while a form has unsaved edits or an upload is running.

## Caching

| What                                                                                             | How                                                          | Cache                   |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ | ----------------------- |
| App shell: `index.html`, `offline.html`, hashed JS/CSS chunks, icons, `face_math.wasm`, manifest | Precache (revisioned; hashed files by name)                  | `workbox-precache-v2-…` |
| In-app navigations                                                                               | Shell (`index.html`); `offline.html` if the shell is missing | —                       |
| Fonts                                                                                            | Cache-first, 30 entries, 1 year                              | `praesto-fonts-v1`      |
| Same-origin images (not `/api`)                                                                  | Cache-first, 80 entries, 30 days, purged on quota errors     | `praesto-images-v1`     |
| `/api/*`, `/socket.io/*`                                                                         | **Not cached**                                               | —                       |

The landing page's product screenshots are not precached (large); they're cached on first view.

On activation the worker deletes caches it doesn't own, including the previous worker's `api-general-v1`, `api-dashboard-v1` and `api-notifications-v1`, which held API responses (profiles, payroll, KYC) readable by anyone using the same browser profile. Bump `CACHE_VERSION` in `sw.ts` to retire runtime caches; precache entries are versioned automatically. Refreshing caches never touches IndexedDB.

## IndexedDB (`praesto-offline`, version 1)

| Store       | Key       | Holds                                                                               |
| ----------- | --------- | ----------------------------------------------------------------------------------- | ------------------------------------------------- |
| `drafts`    | `${scope} | ${formKey}`                                                                         | form values, `baseVersion` for edits, `updatedAt` |
| `mutations` | id        | queued operations (below)                                                           |
| `uploads`   | id        | resumable upload sessions: file metadata, server upload id, confirmed parts, status |
| `files`     | upload id | the selected file's bytes, until the server confirms the upload                     |
| `meta`      | key       | the remembered offline session (no credentials)                                     |

Every record carries `scope` = `${tenantId}:${userId}`, indexed, and every read filters on the signed-in scope. Schema migrations go in `upgrade` in `src/offline/store.ts` (bump `DB_VERSION`). If IndexedDB is unavailable (some private modes), an in-memory store is used and the Pending Changes sheet says changes won't survive closing the page.

### Queued operation

```ts
{
  id, scope, kind,            // e.g. "leave.create"
  label,                      // what the person sees; never the payload
  method, url, body,
  idempotencyKey,             // stable across every attempt
  ifMatch?,                   // version for conflict detection
  uploads?: [{ uploadId, field }], // files sent first; their URL goes into body[field]
  dependsOn?: [id],
  status,                     // queued | syncing | retrying | synced | attention | conflict | auth
  attempts, nextAttemptAt, lastError?: { code, message }, serverCopy?,
  createdAt, updatedAt, syncedAt?, schema
}
```

## Synchronisation

`src/offline/sync.ts` replays the signed-in scope's queue one operation at a time, oldest first, skipping operations whose `dependsOn` aren't synced. It runs on app start, sign-in, tab visibility, the browser's `online` event (confirmed by probing `GET /api/v1/csrf-token`), Background Sync wake-ups, due retries, and the Sync Now / Retry buttons. `navigator.onLine` is only a hint.

| Server answer                                | Result                                                                                                                             |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 2xx                                          | `synced` (kept 24 h under "Recently Sent", then pruned)                                                                            |
| No response                                  | stays `queued`; the pass stops (offline)                                                                                           |
| 401                                          | `auth`: everything pauses; resumes after the person signs in again                                                                 |
| 403 / 402                                    | `attention` with the server's message                                                                                              |
| 400 / 422 / other 4xx                        | `attention`; the server's validation message is shown; not retried                                                                 |
| 409 `VERSION_CONFLICT`                       | `conflict`, with the server's copy kept for comparison                                                                             |
| 409 `IDEMPOTENCY_IN_PROGRESS`, 408, 429, 5xx | `retrying` with exponential backoff (2 s × 2ⁿ, ±50% jitter, max 5 min; `Retry-After` honoured), up to 8 attempts, then `attention` |

Nothing is silently dropped: operations leave the queue only when the server acknowledges them or the person discards them.

**Forms say what happened.** `sendOrQueue` tries the request directly when online; only a missing response falls back to the queue, with the same idempotency key. Forms show "Leave requested." for a server success and "Saved on this device. Your request will be sent when you're back online." for a queued one.

### Idempotency (server)

`apps/api-gateway/src/middleware/idempotency.ts`, on every authenticated business route:

- A POST/PUT/PATCH/DELETE with `Idempotency-Key` claims the key in Redis (`idem:{tenant}:{user}:{key}`). The handler runs once and its response is stored for 24 h.
- A repeat with the same key and the same method, path and body gets the stored response (`Idempotent-Replayed: true`) without the handler running.
- A repeat while the first is still running gets 409 + `Retry-After`; the same key with a different request gets 422.
- 5xx, 401, 403, 408 and 429 responses aren't stored, so a retry runs again. Responses that don't go through `res.json` (files, streams) aren't replayable.
- If Redis is down, the middleware lets requests through (logged), so that request is at-least-once.

The shared API client already sent an `Idempotency-Key` on every POST/PUT/PATCH; the server now honours it, so ordinary double-submits and network retries are deduplicated too. Each mutation costs two extra Redis calls.

### Conflicts

Announcement edits send `If-Match: <lastUpdatedOn>` of the copy the edit started from. `editHrActivity` compares it with the stored `lastUpdatedOn` and returns 409 `VERSION_CONFLICT` with the current title, description and date instead of saving. The queued edit and the server copy are both kept; the sheet shows the changed fields. **Keep Mine** re-sends against the current version; **Use Theirs** discards the local edit. Requests without `If-Match` are unaffected. The check runs in the gateway just before the update, so two saves at the same instant are not fully excluded; making it atomic would mean moving the comparison into the hrm service's update.

## Resumable uploads

The existing one-shot presigned upload (`POST /upload/presigned-url`) is unchanged and is still what online forms use. Files chosen **offline** in forms that opt in (`FileField offlineCapable`, currently the leave medical certificate) use S3 multipart instead:

| Endpoint                          |                                                                                                                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /upload/multipart/start`    | Validates name, type, extension and size (≤ 15 MB, same lists as the presigned route); creates the S3 multipart upload and a Redis session under the tenant + user (24 h) |
| `POST /upload/multipart/part-url` | Presigned PUT for one part (15 min), only within the session's part range                                                                                                 |
| `GET /upload/multipart/:id/parts` | The parts S3 actually holds; the client resumes from this                                                                                                                 |
| `POST /upload/multipart/complete` | Requires every part present, contiguous, adding up to the declared size; completes with S3's own ETags                                                                    |
| `POST /upload/multipart/abort`    | Discards the upload                                                                                                                                                       |

Parts are 5 MB (S3's minimum), so a resume re-sends at most the part that was interrupted. The client (`src/offline/uploads.ts`) keeps the file's bytes in IndexedDB until completion, retries failed parts (server errors) up to three times, starts a new session if the old one expired, and asks the person to choose the same file again (checked by name, size and modified time) if the stored bytes were lost. An upload is "completed" only after `/complete` succeeds, and the queued form is sent only then, with the final URL. Only the person who started an upload can continue, complete or abort it.

## Authentication and tenant isolation

- No access token, refresh token, cookie or credential is ever written to IndexedDB or Cache Storage.
- Queued work belongs to the scope (organisation + user) that created it. It is never shown to, or sent as, another account: the sheet just says how many changes from another account wait on this device.
- The server re-authorises every replayed request with the current session; the tenant comes from the session, not from anything stored.
- A 401 pauses the whole queue until the person signs in again.
- **Sign-out:** unsent changes stay on the device, visible only to their owner, and are sent the next time that person signs in here. The sign-out dialog says so. **Clear Offline Data…** in the sheet removes the signed-in person's drafts, queue and files.
- Browser storage is not encrypted by Praesto. Anyone with access to the device's browser profile can read it, as with any web app data; use Clear Offline Data on shared devices.

### Offline session mode

The access token lives only in memory and is restored with a refresh cookie, which needs the network. So that a reload offline doesn't strand the person on the sign-in page, a minimal profile is remembered after each successful sign-in (`src/offline/session.ts`): id, names, organisation, role, permissions and scope — no credentials. If the app starts and the server can't be reached at all (a network failure, not a refusal), it opens in offline mode as that person. No private data is fetched in that mode. As soon as the server is reachable, the real session is checked: accepted, the full profile replaces the remembered one; refused, the person is signed out. The remembered profile is deleted on sign-out and on any authentication failure.

## Browser support

Capabilities are detected, not assumed:

| Missing                                                  | Fallback                                                                                                                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Service workers                                          | The app works online only; drafts and the queue still work while the tab is open and after reloads made online                                               |
| Background Sync (Safari, Firefox)                        | The app syncs on its own triggers (start, visibility, `online`, timers)                                                                                      |
| Persistent storage (`navigator.storage.persist` refused) | Works, but the sheet warns the browser may clear saved changes under storage pressure                                                                        |
| IndexedDB                                                | In-memory store; the sheet warns changes won't survive closing the page                                                                                      |
| Storage full                                             | Submitting shows "This device is out of storage…" and nothing is lost silently; a file that can't be stored stays in memory for the session and is marked so |

## Diagnostics

`src/offline/diag.ts` records events — registration failures, draft and queue persistence failures, sync passes, deliveries, rejections, conflicts, upload interruptions/resumes/completions, session changes — with codes and counts only (no payloads, names, tokens or file contents). The last 100 are in memory; the Pending Changes sheet shows recent ones under "Diagnostics", and they're logged to the console in development. Server-side events use the gateway's logger.

## Testing

Automated:

```bash
pnpm --filter web test:run                         # queue, sync, retries, auth pause, tenant isolation,
                                                   # conflicts, idempotency keys, resumable uploads
npx jest apps/api-gateway/src/__tests__/middleware/idempotency.test.ts \
         apps/api-gateway/src/__tests__/resumableUpload.test.ts \
         apps/api-gateway/src/__tests__/hrmHandlers.test.ts
```

Testing offline in a browser (a production build is required — the dev server has no worker):

```bash
pnpm --filter web build
cd apps/web && npx vite preview --port 4174   # https://localhost:4174, proxies /api to the gateway
```

Sign in, open a supported form, then in DevTools › Network choose "Offline" and reload. Watch Application › Service Workers, Cache Storage and IndexedDB › `praesto-offline`.

To reset local data: DevTools › Application › Storage › "Clear site data" (removes the worker, caches and IndexedDB), or **Clear Offline Data…** in the app for just your drafts and queue.

## Deployment requirements

- **nginx** (`docker/nginx.conf`, already in place): `firebase-messaging-sw.js` and `*.html` with `Cache-Control: no-store`; hashed `/assets/*` immutable.
- **Redis**: used for idempotency records and upload sessions (the gateway's existing `REDIS_URL`).
- **S3 bucket**:
  - CORS must allow `PUT` from the app's origin (already true for presigned uploads; part uploads use the same method).
  - Add a lifecycle rule **AbortIncompleteMultipartUpload** (for example after 1 day) so abandoned parts are removed. Without it they're kept, and billed, until aborted.
- The worker's URL must stay `/firebase-messaging-sw.js` (existing registrations and push subscriptions depend on it).

## Known limitations

- Only the workflows in the matrix are offline-capable; others need a connection.
- Records aren't readable offline beyond what's on screen; there is no offline copy of HR data, by design (shared devices).
- Background Sync can only wake an open app; with no Praesto tab open, queued work is sent the next time the app opens.
- Online forms still use the one-shot presigned upload; only files chosen offline are resumable.
- The announcement version check is not atomic with the update (see "Conflicts").
- Browsers may evict storage under pressure unless persistence is granted; the app says so but can't prevent it.
