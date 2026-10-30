# Tenant support (organisations → Praesto)

Organisations raise tickets with the Praesto team: bugs, technical issues,
billing, feature requests, suggestions, general questions and security
concerns. This is separate from the employee **Helpdesk** (`/helpdesk`,
tickets to the organisation's own HR, stored in each tenant DB).

## Architecture decision: master DB, explicit tenant scoping

Praesto keeps one MongoDB database per tenant plus a shared master DB
(`Tenant`, `User`, `TenantMembership`, MCP grants, trial claims). Support data
lives in the **master DB**, in five collections: `support_tickets`,
`support_messages`, `support_attachments`, `support_activities` and
`support_counters`.

Why not the tenant DBs: the support team works across every organisation.
Per-tenant storage would mean opening a client for every tenant DB just to
list a queue, which is the uncontrolled cross-tenant access path this design
avoids. With one collection set, the queue is a single indexed query.

How isolation holds anyway:

- Tenant endpoints take the tenant only from the verified JWT
  (`req.user.tenantId`). Every query's `where` includes it, and nothing reads
  a tenant id from the body, query or params. The zod schemas are `.strict()`,
  so extra fields such as `tenantId` or `reporterId` are rejected outright.
- A ticket outside the caller's visibility returns **404**, never 403, so ids
  can't be probed.
- Internal notes, internal attachments and internal activity are excluded in
  the tenant queries (`visibility: "public"`). Tenant responses are built from
  allow-listed fields (`services/supportPolicy.ts`), so internal fields such
  as `assigneeId` or `version` never leak by default.
- No HR records are stored or read here. The console shows only the
  reporter's and participants' names/emails, plus the organisation's name,
  slug, plan, subscription state and signup date.

## Who can do what

|                                                 | How it's granted                                                                                                        |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Raise tickets                                   | tenant role owner/admin/hr, a superuser, or `Support:raise_tickets`                                                     |
| See own tickets, and ones you've replied on     | always (within your organisation)                                                                                       |
| See the whole organisation's tickets            | owner/admin, a superuser, or `Support:view_org_tickets`                                                                 |
| …including others' **Security Concern** tickets | owner, a superuser, or `Support:view_security_tickets`                                                                  |
| Praesto console (`/platform/support`)           | being in **Praesto's own organisation** as its owner/admin, a superuser, or a holder of `PraestoSupport:handle_tickets` |

`isSuperUser` and `permissions` are honoured only when the user record belongs
to the token's tenant.

### The Praesto organisation and support access

Praesto's own organisation is identified by **`PLATFORM_TENANT_ID`** (config,
set once per environment), never by its name, slug or domain, so no customer
can become "Praesto" by what they call their org. If the variable is unset or
malformed, the console is closed to everyone (it fails closed).

Who works the queue is derived, not stored:

- **Owners and admins of the Praesto org** always have access.
- **Anyone else in the Praesto org** gets it from the normal Permissions
  screen: grant **Praesto Support → Handle Tickets**
  (`PraestoSupport:handle_tickets`) to a role or a person.
- **Removing the permission, or removing someone from the org,** revokes
  access on their next request. Former employees (Terminated, Absconded,
  Resigned, …) never have access.
- **Customer organisations can't use the module:** the Permissions screen
  doesn't offer it there, and the gateway rejects it as an unknown permission
  (`PLATFORM_ONLY_MODULES` in `@hrms/common`). Being an owner or superuser
  of a customer org grants nothing.

Adding a teammate is therefore the normal Praesto flow: invite them to the
Praesto org, then give them the permission (or make them an admin).

## Lifecycle

Statuses: `open`, `in_progress`, `waiting_for_tenant`, `resolved`, `closed`.

Agent transitions (enforced server-side, `config/support.ts`):

```
open               → in_progress | waiting_for_tenant | resolved | closed
in_progress        → waiting_for_tenant | resolved | closed
waiting_for_tenant → in_progress | resolved | closed
resolved           → in_progress | closed
closed             → (terminal)
```

Automatic rules:

- **Agent public reply**: the ticket moves to Waiting for Tenant unless the
  agent picks In Progress or Resolved in the composer. The first public reply
  sets `firstResponseAt`.
- **Internal note**: never changes status and never notifies the tenant.
- **Tenant reply**: Waiting for Tenant moves to In Progress. Open and In
  Progress are unchanged. Resolved tickets must be **reopened** (allowed
  within 14 days of resolution, and a reason is required). Closed tickets
  accept nothing.
- **Tenant confirm-close**: Resolved moves to Closed.
- **Requested priority**: the tenant's urgency is stored as
  `requestedPriority`. A ticket asked as `urgent` starts at `high` until an
  agent confirms it.
- **Mark duplicate**: closes the ticket and links it to another ticket from
  the **same** organisation (cross-tenant links are refused).

Every change is a version-guarded `updateMany({ id, version })` inside a
transaction, together with its `SupportActivity` row. Two agents acting at
once get a **409** instead of silently overwriting each other. Moving back to
an active status clears `resolvedAt`, so resolution metrics only count
resolutions that still stand (the activity log keeps the history).

Ticket numbers are `PRA-<year>-<6 digits>`, allocated by an atomic
`findAndModify $inc` on a per-year counter document (never a row count). A
race on the first upsert of a year is retried.

Repeated submissions are caught in three layers: the button locks on submit
(a ref guard as well as state), the gateway's existing Idempotency-Key
middleware, and a server check that returns the existing ticket when the same
reporter submits the same subject and description within 2 minutes.

## Attachments

The feature reuses the existing S3 bucket (`config/s3.ts`); the bucket has no
public read.

1. `POST …/attachments` validates name, type and size, then issues a
   5-minute signed PUT. The URL pins `Content-Type` and `Content-Length`, and
   the key is `support/<tenantId|staff>/<uuid><ext>` (no user input in the
   path).
2. The browser PUTs the file directly to S3.
3. `POST …/attachments/:id/complete` reads the object's real size and its
   first 4 KB, and checks the magic bytes against the declared type. Anything
   else is deleted and marked `rejected`.
4. Only the uploader's own verified (`ready`) uploads can be attached to a
   ticket or reply. They inherit the message's visibility.
5. Downloads go through `GET …/attachments/:id/url`: the same ticket and
   visibility checks as the conversation, then a 5-minute signed GET with
   `attachment` disposition (images are inline).

Allowed types: PNG, JPEG, GIF, WebP, PDF, TXT/LOG, CSV. Limits: 10 MB per file
and 5 files per message. SVG is excluded because it is scriptable, and
Office/zip files are excluded because they can't be verified without
unpacking.

## Notifications

All notifications go through the existing `notify()` pipeline (BullMQ: in-app

- WebSocket + push, plus email, with the queues' retries). Handlers dispatch
  fire-and-forget. A failure is logged as a warning and reported as `false`,
  never as delivered.

| Event                 | Who is notified                                                           |
| --------------------- | ------------------------------------------------------------------------- |
| New ticket            | everyone with support access (in-app in the Praesto org + email)          |
| Tenant reply / reopen | the assignee, or everyone with support access if the ticket is unassigned |
| Agent public reply    | the reporter and tenant participants (in-app + email)                     |
| Status change         | the reporter and participants (in-app + email)                            |
| Priority change       | the reporter and participants (in-app)                                    |
| Assignment            | the new assignee (in-app + email)                                         |
| Internal note         | the assignee, if someone else wrote it (in-app); **never the tenant**     |

For Security Concern tickets, no notification or email carries the subject or
message text, only the ticket number. Agent views of security tickets are
logged as internal `security_viewed` activities (at most once per agent per 30
minutes). Push is sent only to named users; the worker's all-users fallback is
never triggered. Ticket contents are never logged.

## API

Tenant (`authenticate` + `requireTenant` + `idempotency`; **not** behind the
subscription guard, so a lapsed organisation can still report billing
issues):

```
GET  /support/context                    capabilities (UI hints)
GET  /support/stats?scope=mine|org
GET  /support/tickets?scope&status&category&priority&search&sort&page&limit
POST /support/tickets
GET  /support/tickets/:id                ticket + public conversation
POST /support/tickets/:id/replies
POST /support/tickets/:id/reopen
POST /support/tickets/:id/close
POST /support/attachments
POST /support/attachments/:id/complete
GET  /support/attachments/:id/url
```

Praesto console (`authenticate` + `requireSupportAgent` + `idempotency`):

```
GET   /platform/support/stats            counts, 30-day metrics, recent
GET   /platform/support/agents
GET   /platform/support/tickets?status&category&priority&tenantId&assignee=me|unassigned|<id>&from&to&search&sort&page&limit
GET   /platform/support/tickets/:id      everything, incl. internal + tenant metadata
PATCH /platform/support/tickets/:id      { status?, priority?, assigneeId?, version }
POST  /platform/support/tickets/:id/replies   { body, visibility, status?, attachmentIds, version }
POST  /platform/support/tickets/:id/duplicate { duplicateOfTicketNo, version }
POST  /platform/support/attachments
POST  /platform/support/attachments/:id/complete
GET   /platform/support/attachments/:id/url
```

Metrics are defined as follows:

- **Average first response**: `createdAt` to the first public agent reply,
  over tickets created in the last 30 days that have one.
- **Average resolution**: `createdAt` to `resolvedAt`, over tickets resolved
  in the last 30 days.

Both show their sample size.

## Web

Everything sits under one sidebar section, **Help & Support**, whose pages
show only to the people they apply to: **Support Tickets** (anyone who can
raise or view tickets), **Support Console** (the Praesto team) and **Keyboard
Shortcuts** (everyone).

- `/support`: overview counts, a My Tickets / Organization toggle (shown only
  to users allowed to see the organisation's tickets), filters, search, sort
  and server-side pagination.
- `/support/new`: category cards, category-specific optional fields,
  attachments and a draft that survives a reload.
- `/support/tickets/:id`: the conversation, reply form, and reopen/close
  actions with confirmations.
- `/platform/support` (**Support Console**, shown only when `/profile`
  returns `isSupportAgent`): queue metrics, response metrics, recently updated
  tickets, and the full ticket table. Clicking a row opens an inspector with
  status, priority and assignment controls.
- `/platform/support/tickets/:id`: the full timeline. Internal notes have a
  dashed amber style and a lock label. The composer has a Reply / Internal
  Note switch, and the internal mode shows a "Praesto team only" warning.

## Deploying

1. **Indexes.** These are created at gateway boot by `ensureMasterIndexes()`,
   so no `db:migrate` is needed (support data is master-only). Running
   `pnpm db:push` against master is also fine.
2. **Rebuild** `api-gateway` and `web`. The shared packages `@hrms/db`
   (Prisma client), `@hrms/common` and `@hrms/notifications` changed, so
   `notification-service` picks up the new event names on its next build. It
   needs no code change.
3. **Set `PLATFORM_TENANT_ID`** to the Praesto organisation's id: in
   `local-secrets.json` locally and in the `hrms/config` secret in production.
   This is the only new configuration; email links use the existing
   `CLIENT_URL` (first entry). Without it, tickets are still stored, but
   nobody is notified and the console is closed.

## Known limitations

- Abandoned uploads (requested but never attached) stay in S3. An S3
  lifecycle rule on the `support/` prefix (for example, expire after 7 days if
  untagged) or a small sweep job would clean them up.
- Resolved tickets aren't auto-closed. Agents close them, or tenants confirm
  them closed.
- No malware scanning beyond type verification. Office documents are
  therefore not accepted.
- Notifications in the bell aren't links (this is true app-wide); the message
  includes the ticket number.
