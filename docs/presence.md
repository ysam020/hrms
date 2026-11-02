# Employee availability and presence

Employees can tell colleagues whether they're reachable (Busy, In a Meeting,
Do Not Disturb…), and colleagues see it next to the person's avatar while it
updates live.

## Three separate things

| Concept          | Values                                                      | Source                                             | Stored in                               |
| ---------------- | ----------------------------------------------------------- | -------------------------------------------------- | --------------------------------------- |
| **Availability** | available, busy, dnd, meeting, break, lunch, focusing, away | Chosen by the person, or restored automatically    | MongoDB, tenant DB, `presence_statuses` |
| **Connectivity** | online, idle, offline                                       | Open sockets plus a coarse activity signal         | Redis only                              |
| **Work mode**    | office, remote, field                                       | Approved WFH for today, else `User.attendanceMode` | Derived, never stored                   |

None of these implies another. Working remotely isn't the same as being
available, and being online isn't either.

**What an indicator shows** (`displayStatus`, the same rule on server and client):

- offline → **Offline**. The chosen availability is still returned and shown
  as secondary text ("Offline · Busy").
- idle + Available → **Away**.
- otherwise → the chosen availability. A manual Busy stays Busy while the
  person is idle, and reconnecting never replaces Do Not Disturb.

"Working Remotely" is shown as a work-mode badge, not as an availability.

## Choosing a status

`PUT /presence/me` with `{ availability?, message?, duration?, timeZone? }`.
It accepts no other fields (the zod schema is `.strict()`), so a body can't
name another user or tenant.

- Durations: `30m`, `1h`, `2h`, `end_of_day`, `until_changed` (the default).
- `end_of_day` = `TenantSettings.workStartHour:workStartMinute + fullDayMinHours`
  in the person's IANA zone (sent by the browser). Once that time has passed,
  the status runs until local midnight instead.
- Messages are plain text, one line, at most 140 characters.
- When you set a timed status, the status _without an end time_ underneath it
  is remembered (`previousAvailability`/`previousMessage`). When the timed
  status ends, that one comes back (e.g. "Lunch, 1 hour" over Do Not Disturb
  returns to Do Not Disturb). If nothing was remembered, it returns to Available.
- `POST /presence/me/restore` goes back to the remembered status (or Available).
- `DELETE /presence/me/message` clears the message and keeps the status.
- Someone who has never chosen a status is Available (`source: "default"`).

Every write is a read → compute → `updateMany where revision = n` loop. Two
devices writing at once can't interleave: the later write is recomputed on top
of the earlier one. Writes that change nothing are skipped (no event is sent).

## Expiry

- **Reads never wait for a job.** A row whose `expiresAt` has passed already
  reads as the restored status.
- **A BullMQ delayed job makes it durable.** Queue `presenceQueue`, one job per
  timed status with jobId `px-<tenant>-<user>-<revision>`. The worker
  (`workers/presenceExpiryWorker.ts`) runs on the gateway's designated worker,
  next to the payroll worker. It writes only if the stored revision still
  equals the job's revision, so a late, duplicate or superseded job does
  nothing. Superseded jobs are also removed from the queue. The status ends
  even if every tab is closed.

## Connectivity

The socket handlers are in `config/presenceSocket.ts`; the Redis keys are in
`services/presenceConnectivity.ts`.

- The client sends `presence:heartbeat {state}` every 25 s and whenever its
  state changes. It goes `idle` after `PRESENCE_IDLE_SECONDS` (default 300,
  allowed range 60–3600) without input. Only the time of the last input event
  is kept. Keys, pointer positions and screen contents are never recorded or
  sent.
- `px:conn:<t>:<u>` is a hash of `socketId → state|ms`, one entry per tab or
  device. Any active entry means online; only idle entries mean idle. Entries
  older than 100 s are ignored, and the key expires when heartbeats stop.
- Offline is announced 30 s after the last connection closes, and only if
  nothing reconnected in the meantime. A refresh or a brief network drop
  therefore never shows Offline. `lastActiveAt` is written to MongoDB then:
  once per session, never per heartbeat.
- `px:last:<t>:<u>` holds the last connectivity announced. It's shared across
  workers, so multiple tabs don't produce duplicate events.

## Real-time events

| Direction       | Event                       | Payload                                                                |
| --------------- | --------------------------- | ---------------------------------------------------------------------- |
| client → server | `presence:heartbeat`        | `{ state: "active" \| "idle" }`                                        |
| client → server | `presence:watch` (with ack) | `{ userIds: string[] }` (max 500) → `{ ok, presence: PresenceView[] }` |
| server → client | `presence:update`           | `PresenceView`                                                         |

`PresenceView` = `{ userId, availability, status, connectivity, source,
message, expiresAt, workMode, lastSeenAt (only while offline), revision, at }`.
It never contains profile data, the remembered previous status or the time zone.

Watching joins one Socket.IO room per person, `px:<tenantId>:<userId>`, for
people the watcher may see. The tenant always comes from the socket's verified
JWT. Each socket is also in its own room, so the person's other tabs and
devices follow their changes. Events are published on the Redis channel
`socket:presence`; every gateway worker emits them to its local room. This
uses the existing subscriber connection, with no new connection or adapter.
Clients keep an event only if it has a higher `revision`, or the same revision
with a later `at`. Stale and duplicate events are dropped. On every
(re)connect the client re-sends its heartbeat and watch list, and the watch
reply brings it back in sync.

Watches are rate-limited to 30 per minute per socket. Visibility is checked
when a watch is made: if someone leaves a team mid-session, their events keep
arriving until that socket next watches or reconnects (at the latest when the
access token expires).

## Who can see whom

- **Self:** always.
- **Team:** anyone you share a `Team` with, as leader or member.
- **Organisation:** superusers, HR roles (owner/admin/hr, the same gate other
  modules use) and anyone granted the new permission **`Presence:view:all`**
  (Permissions → User/Role permissions). A role name such as "manager" alone
  grants nothing.

Ids from another organisation are never resolved: the user model is
tenant-scoped, and room names carry the tenant from the token.
`GET /presence/people?scope=organisation` returns 403 without org-wide access.
Nobody can change another person's status; there's no admin override.

## Do Not Disturb and notifications

Do Not Disturb holds back **chat push notifications** only (the
`px:dnd:<t>:<u>` flag, which expires with the status). Chat messages still
arrive in the app. HR notifications (approvals, payroll, attendance,
compliance) go through notification-service and are not affected. If Redis
can't be reached, the filter lets notifications through. Status changes never
create notifications.

## API

All routes are under `/api/v1/presence`, with `authenticate` + `requireTenant`
and no subscription check (same reasoning as `/walkthrough`).

| Method | Path                                                   | Purpose                                                                                               |
| ------ | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| GET    | `/presence/me`                                         | Own status, `previous`, `timeZone`, and `config { idleAfterSeconds, heartbeatSeconds }`               |
| PUT    | `/presence/me`                                         | Choose a status, or change only the message                                                           |
| POST   | `/presence/me/restore`                                 | Back to the previous status, or Available                                                             |
| DELETE | `/presence/me/message`                                 | Clear the message                                                                                     |
| GET    | `/presence?ids=a,b`                                    | Batch presence (only the visible ids are returned)                                                    |
| GET    | `/presence/people?scope=&status=&search=&page=&limit=` | Filtered, counted list `{ people, counts, total, truncated, scopes }` — not used by the web app today |

The people list examines at most 2,000 people after search (`truncated: true`
beyond that), computes presence in one Mongo query plus one Redis pipeline,
and sorts reachable people first.

## Web

`apps/web/src/features/presence/`:

- `PresenceProvider`: in AppShell, inside SocketProvider.
- `PresenceDot` / `PresenceAvatar` / `PresenceSummary`: indicators with a
  colour, a glyph and an accessible name.
- `StatusPicker`: a popover on desktop and a bottom sheet on phones.

Other people's availability is shown **only in the employee directory**
(`/employee-management/employee-list`): a live dot on each avatar and an
Availability column (status, message, end time, work mode, last active).
There is no separate Availability page or sidebar entry. People set their own
status from the sidebar account menu ("Set Status…") or from My Profile.

## Deploying

1. Create the unique index `(tenantId, userId)` on `presence_statuses` in every
   tenant DB: `pnpm --filter @hrms/db db:migrate`. Follow the pre-checks in
   docs/performance/database-schema-and-index-audit.md. Push tenants only,
   never master. Without the index, writes still work, but a concurrent first
   write could create a duplicate row (reads always take the oldest).
2. Rebuild and redeploy api-gateway and web. No new services or dependencies.
3. Optional: `PRESENCE_IDLE_SECONDS` (default 300).

## Not built (yet)

- **Calendar-driven "In a Meeting".** Praesto has no meeting data: personal
  calendar entries are free text with no time zone and no attendees, so
  deriving meetings from them would mislabel people. "In a Meeting" is chosen
  manually. A Google or Outlook source would be added as a new
  `source: "calendar"` that loses to manual choices.
- **No Hybrid work mode**, because the app doesn't model it.
- **No Today dashboard widget** for team availability.
- **No availability filter in the directory yet.** The directory's list
  (`/view-all-kycs`) is paginated by the server and knows nothing about
  presence; `/presence/people` already supports filtering if one is wanted.
