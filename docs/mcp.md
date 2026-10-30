# Connecting AI assistants to Praesto (MCP)

Praesto no longer runs its own chatbot. Instead, anyone in an organisation can
connect the AI assistant they already use to Praesto through the
[Model Context Protocol](https://modelcontextprotocol.io) (MCP). The assistant
provides the conversation and the model; Praesto answers its tool calls with
data the signed-in person is allowed to see.

Praesto hosts no model and calls no LLM API. There is no Ollama server, no GPU
and no LLM API key on Praesto's side.

- [For organisation admins and employees](#for-organisation-admins-and-employees)
- [How sign-in works](#how-sign-in-works)
- [Tools](#tools)
- [Security model](#security-model)
- [Privacy](#privacy)
- [Limitations](#limitations)
- [Troubleshooting](#troubleshooting)
- [For developers](#for-developers)

---

## For organisation admins and employees

### What you need

- A Praesto account in an organisation with an active subscription.
- An AI assistant that supports **remote MCP servers with OAuth sign-in**,
  often called _custom connectors_. It must support the Streamable HTTP
  transport, OAuth 2.1 with PKCE, and dynamic client registration.

> **Client support status.** The server follows the MCP authorization
> specification and has been tested end to end with a scripted MCP client and
> the official MCP SDK. It has **not yet been tested against Claude, ChatGPT or
> any other specific assistant**, so none is listed as supported yet. Check
> your assistant's own documentation: custom connectors are often limited to
> particular plans, and some assistants only offer them in developer or beta
> modes.

### Connect an assistant

1. In Praesto, open **AI Assistants** in the sidebar and copy the address
   shown there. In production it is:

   ```
   https://api.praesto.in/mcp
   ```

2. In your assistant, add a custom connector (it may be called an MCP server
   or integration) with that address. No client ID or secret is needed: the
   assistant registers itself automatically.
3. The assistant opens Praesto in your browser. Sign in the way you always
   do, with **Google** or a **passkey**. If you're already signed in to
   Praesto in that browser, this step is skipped.
4. Praesto shows which assistant is asking and what it will be able to read.
   Untick anything you don't want to share. **Salary is unticked by default.**
   Then select **Allow**.
5. You're returned to the assistant, which can now answer questions such as
   _"How much leave do I have left?"_ or _"What's our work-from-home policy?"_

### Disconnect an assistant

Go to **AI Assistants → Connected Assistants** and select **Disconnect**. The
assistant loses access on its very next request; there is no grace period.
Connections also end automatically:

- after **90 days**, after which you connect again;
- when the person is offboarded (status _Terminated_, _Absconded_ or
  _Resigned_) or removed from the organisation;
- when the organisation is deactivated.

While a subscription has lapsed, calls are refused. The connection itself
isn't revoked, but most assistants give up once a refresh fails, so expect
to connect again after renewing.

### What admins can see

Every connection, disconnection and tool call is written to the
organisation's **Audit Logs** (owners and admins only), as entity
`McpConnection`. Each entry records who, which assistant, which tool and
whether it succeeded. It never records what the tool returned.

---

## How sign-in works

Praesto's gateway acts as both the OAuth 2.1 **authorization server** and the
MCP **resource server**. Praesto's existing sign-in is not changed and no
password login exists. Google and passkey sign-in work exactly as they do in
the web app, because the consent step runs _inside_ the web app, on its normal
session.

```
Assistant                    Gateway (api.praesto.in)            Web app (praesto.in)
   │  POST /mcp (no token)          │                                   │
   │ ─────────────────────────────▶ │ 401 + WWW-Authenticate            │
   │  GET /.well-known/oauth-protected-resource/mcp, …/oauth-authorization-server
   │  POST /oauth/register          │ → client_id (public, no secret)   │
   │  browser → GET /oauth/authorize (PKCE S256, state)                 │
   │                                │ ─ 302 → /connect/authorize/:id ─▶ │
   │                                │        sign in with Google / passkey if needed
   │                                │ ◀── approve (session + CSRF) ──── │
   │  browser ← 302 redirect_uri?code&state&iss                         │
   │  POST /oauth/token (code + code_verifier)                          │
   │ ◀── access token (1 h) + refresh token (rotating)                  │
   │  POST /mcp (Bearer)            │ verify → grant → membership → plan → tool
```

| Item                 | Detail                                                                                                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Discovery            | `/.well-known/oauth-protected-resource/mcp` (RFC 9728) and `/.well-known/oauth-authorization-server` (RFC 8414)                                                                                  |
| Client registration  | `POST /oauth/register` (RFC 7591). Public clients only; PKCE replaces a secret. Redirect URIs must be `https`, `http` on localhost, or a reverse-domain app scheme                               |
| Authorization        | `GET /oauth/authorize`. Requires `response_type=code`, PKCE `S256`, and an exactly registered `redirect_uri` (loopback URIs may vary the port). `resource` must be the `/mcp` URL if sent        |
| Consent              | Web app `/connect/authorize/:requestId`. The request expires after 10 minutes and can be answered only once                                                                                      |
| Authorization code   | Valid for 2 minutes, single use, bound to client, redirect URI and PKCE challenge. A failed exchange attempt burns it                                                                            |
| Access token         | JWT, 1 hour. `iss` = gateway, `aud` = `…/mcp`. Signed with a key derived from (but different from) the web session key, so it can't be used on `/api/v1`, and web tokens can't be used on `/mcp` |
| Refresh token        | Opaque, rotated on every use, stored only as a SHA-256 hash. Reusing an old one revokes the whole connection (OAuth 2.1 reuse detection)                                                         |
| Revocation           | Disconnect in the web app, or `POST /oauth/revoke` (RFC 7009). Effective on the next call, because every call checks the grant                                                                   |
| Who the token is for | The user and organisation of the Praesto session that approved. Tool arguments can never change it                                                                                               |

A person who belongs to several organisations connects in whichever
organisation their Praesto session is currently in. Each organisation is a
separate connection.

---

## Tools

All tools are **read-only**, and none takes a user, employee or organisation
argument. Input schemas are strict: an unexpected argument such as `userId` or
`tenantId` is rejected, not ignored. Tools that read beyond the caller's own
records apply the same server-side check as their web screen by calling that
screen's own helper (see the second table).

| Tool                         | Scope (consent item) | Sign-in | Reads                                                                                                                                                        | Implemented by                                                          |
| ---------------------------- | -------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `get_my_profile`             | `profile:read`       | Yes     | Own name, emails, mobile, DOB, blood group, department, designation, joining date, status, role. **No** Aadhaar, PAN, bank, PF/UAN/ESIC, addresses or photos | `fetchFullProfile` (same as `GET /profile`)                             |
| `get_my_leave_balance`       | `leave:read`         | Yes     | Own balance per leave type                                                                                                                                   | leave-service `GetLeaveBalance`                                         |
| `list_my_leave_applications` | `leave:read`         | Yes     | Own applications (≤ 20), filter by status / upcoming                                                                                                         | leave-service `GetLeaves`                                               |
| `get_my_attendance`          | `attendance:read`    | Yes     | Own attendance for a month, with a summary                                                                                                                   | attendance-service `GetAttendance`                                      |
| `get_my_salary`              | `payroll:read`       | Yes     | Own salary structure for a month (latest by default)                                                                                                         | salary-service `GetSalaryStructure` (same as `GET /get-user-salary`)    |
| `search_policies`            | `org:read`           | Yes     | Organisation's HR policies: ids and 300-character excerpts (≤ 20)                                                                                            | same query as `GET /policies`                                           |
| `get_policy`                 | `org:read`           | Yes     | One policy's full text                                                                                                                                       | same query as `GET /policies`, deleted ones excluded                    |
| `list_announcements`         | `org:read`           | Yes     | Organisation's **Active** announcements (HR activities) (≤ 20)                                                                                               | same query as `GET /get-hr-activities`                                  |
| `list_holidays`              | `org:read`           | Yes     | Organisation's holiday calendar for a year                                                                                                                   | `listHolidays` (same as `GET /get-holidays/:year`)                      |
| `list_job_openings`          | public               | No      | Open positions on an organisation's public careers page                                                                                                      | recruitment-service `ListJobOpenings` (same as `/public/careers/:slug`) |
| `get_job_opening`            | public               | No      | One open position on that page                                                                                                                               | recruitment-service `GetJobOpening`                                     |

**Your own records, and work that involves other people:**

| Tool                       | Scope (consent item) | Who can use it                                    | Reads                                                                                                             | Same rule as                                                                                    |
| -------------------------- | -------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `list_my_wfh_requests`     | `attendance:read`    | Everyone, if the organisation has WFH on          | Own work-from-home requests                                                                                       | `/wfh` routes (`requireWfhEnabled`, own records)                                                |
| `list_my_calendar`         | `calendar:read`      | Everyone                                          | Own calendar events + organisation holidays in a date range (≤ 1 year)                                            | Calendar page (`listCalendarEvents`, `listHolidays`)                                            |
| `list_my_approvals`        | `approvals:read`     | Whoever the item is waiting on                    | Pending leave, WFH, overtime, resignation, KYC and join requests (summaries, ≤ 50)                                | Approvals inbox (`getPendingApprovalItems`, `getPendingKycItems`, `getPendingJoinRequestItems`) |
| `list_unread_messages`     | `messages:read`      | Everyone                                          | Unread messages sent to the caller (sender, conversation, text; files listed, not linked). Doesn't mark them read | `GET /chat/unread-counts` (participant, not sender, not read)                                   |
| `list_helpdesk_tickets`    | `helpdesk:read`      | Own tickets; all tickets for helpdesk managers    | Tickets with status, priority, SLA                                                                                | `listTickets` (`assertHrRole` in helpdesk.ts). SLA breach computed, not written                 |
| `get_helpdesk_ticket`      | `helpdesk:read`      | Own tickets; any for helpdesk managers            | One ticket and its comments; internal notes only for managers                                                     | `getTicket`                                                                                     |
| `get_recruitment_pipeline` | `recruitment:read`   | HR or above, or any `JobOpenings:*` permission    | Openings with candidate counts per status (no candidate names)                                                    | Web Job Openings gate (`canAccessJobOpenings`)                                                  |
| `list_job_candidates`      | `recruitment:read`   | Owners, admins, superusers                        | One opening's candidates: name, status, stage, resume score. No contact, Aadhaar or resume                        | `requirePrivileged` on `/view-applications`                                                     |
| `list_saved_reports`       | `reports:read`       | Whoever the reports API admits (see Known issues) | Saved reports' names and what they cover                                                                          | `assertHrRole` in reports.ts                                                                    |
| `run_saved_report`         | `reports:read`       | Same                                              | One saved report's rows, capped at 200. Doesn't stamp "last run"                                                  | `executeReport` in reports.ts                                                                   |

Messages, recruitment and reports are **off by default** on the consent
screen, like salary: they pass other people's data (coworkers' words,
candidates, organisation-wide figures) to the assistant.

**Endpoints:**

- `https://api.praesto.in/mcp` requires sign-in and lists the public tools plus
  whichever signed-in tools the connection's scopes allow.
- `https://api.praesto.in/mcp/public` needs no sign-in and lists only the two
  careers tools.

### What "public" means here

Praesto has exactly one kind of anonymously readable information: an
organisation's careers page. HR policies, announcements and holidays are
visible only to signed-in members of the organisation, so they are **not**
public tools. Even the careers tools return less than the careers API does:
they leave out budget, hiring manager and internal bookkeeping, and they
never show openings marked _internal_ or openings that aren't _Active_.

### Parity with the retired chatbot

| Chatbot tool (Ollama)    | Behaviour                                         | MCP tool                                          | Notes                                                                                                      |
| ------------------------ | ------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `get_user_profile`       | Own profile                                       | `get_my_profile`                                  | The chatbot returned the encrypted mobile number as stored; the tool now decrypts it like the web app does |
| `get_leave_balance`      | Own balance (raw row)                             | `get_my_leave_balance`                            | Now the leave service's per-type summary under the organisation's policy                                   |
| `get_leave_applications` | Own recent applications (≤ 10)                    | `list_my_leave_applications`                      | ≤ 20, with status/upcoming filters                                                                         |
| `get_attendance`         | Own month of attendance                           | `get_my_attendance`                               | Through attendance-service                                                                                 |
| `get_salary_info`        | Own latest salary structure                       | `get_my_salary`                                   | Behind its own consent item, off by default; specific months supported                                     |
| `get_policies`           | Policy search (full text of ≤ 3)                  | `search_policies` + `get_policy`                  | Excerpts first, full text on request                                                                       |
| _(system prompt)_        | Refuse other people's data and off-topic requests | Enforced in code: no tool can address anyone else | Topic scoping is now the assistant's concern; access control never depended on the prompt                  |
| —                        | —                                                 | `list_announcements`, `list_holidays`, careers    | New                                                                                                        |

The chatbot could not change data, and neither can the MCP tools.

---

## Security model

The central guarantee is that **an assistant can never read more than the
person who connected it can, and in practice reads less**:

- **Identity comes only from the token.** Each "my" tool uses the user id
  from the verified access token, and organisation data comes from that
  token's organisation database. There is no argument to point a tool at
  someone else, and strict schemas reject attempts to add one.
- **Role-gated tools reuse the web check, not a copy of it.** Approvals,
  helpdesk, recruitment and reports call the same helper their web screen
  calls, passing the token's user and the membership's _current_ role. Where
  a tool returns less than the screen (no candidate contact details, no
  report beyond 200 rows), it's narrower, never wider. A refusal reads as
  "not available", so an assistant can't probe for what exists.
- **Same isolation as the web app.** Each call runs inside the same tenant
  context `authenticate` establishes for web requests (`runWithTenant` and
  the gateway tenant storage). `prismaWithTenant` therefore reads that
  organisation's own database, and gRPC calls carry the same tenant
  metadata. Caches in use are keyed by tenant (`t:<tenantId>:…`).
- **Re-checked on every call.** The token's signature, issuer, audience and
  expiry; that the grant is still active and matches the token's user,
  organisation and client; that the person is still a member and not
  offboarded; that the organisation is active; and that the subscription is
  usable. Each call also uses the membership's current role.
- **Scopes only narrow.** A tool outside the connection's scopes isn't listed
  and is refused if called anyway. A token can never carry more scopes than
  its grant.
- **No fallback to anonymous.** A missing or invalid token on `/mcp` gets a
  401 with an OAuth challenge. It is never served as a public request.
- **Errors stay generic.** Internal failures return _"Praesto couldn't complete
  that just now"_; details go only to server logs.
- **Rate limits** are Redis-backed and shared by every gateway worker:
  - `/mcp`: 600 requests/min per IP before authentication, then 120/min per
    connection.
  - `/mcp/public`: 60/min per IP.
  - Client registration: 20/hour per IP.
  - Authorize: 100 per 15 min.
  - Token and revoke: 200 per 15 min.
- **Prompt injection.** Policy, announcement and job text is written by
  people, and tool descriptions tell the assistant to treat it as data. That
  is advice, not a boundary. The real boundary is that no tool can write,
  and no tool can reach beyond the connected person's own access, whatever
  the assistant is persuaded to try.
- **Logs and audit entries** record identifiers (user, organisation, client,
  grant, tool, outcome, duration) and never tokens, arguments or results.
  Metrics: `mcp_tool_calls_total{tool,outcome}` and
  `mcp_tool_call_duration_ms{tool}`.

## Privacy

Whatever a tool returns is sent to the company that runs the assistant and
handled under that company's terms, which may include retention or model
training depending on the person's plan and settings. This is why:

- consent is per item, and salary, messages, recruitment and reports are off
  by default;
- the profile tool never returns identity documents, bank details or
  addresses;
- results are bounded (e.g. ≤ 20 rows, truncated long text).

Organisations that must not send HR data to a third-party AI provider should
tell their people not to connect assistants. A per-organisation switch to
disable MCP entirely is not built yet (see below).

## Limitations

- **Read-only.** Applying for leave, approving requests and every other write
  action are not available through MCP yet.
- **No team views of attendance or leave.** A manager can see what's waiting
  for their approval, but not their team's attendance or leave history.
- **Existing connections don't get new tools automatically.** Scopes are fixed
  when someone allows a connection; to use tools added later (calendar,
  approvals, helpdesk, messages, recruitment, reports), disconnect and
  connect again.

### Known issues in the existing app (not changed here)

- **Reports are effectively superuser-only.** `/reports` checks the legacy
  `User.role` field, which is never populated, while the web app shows Reports
  to owners, admins and HR. The MCP report tools apply the server's rule, so
  owners, admins and HR who aren't superusers get "not available" — the same
  403 the web API gives them.
- **Any member can read any application's interview-stage history**
  (`GET /applications/:id/stage-events` checks only the organisation). MCP
  doesn't expose stage history.
- **No admin controls yet.** There is no per-organisation switch to disable
  MCP, and admins can't list or revoke other people's connections; they see
  them only in Audit Logs.
- **No Client ID Metadata Documents.** Clients must use dynamic client
  registration. Unused registrations aren't cleaned up automatically.
- **Refresh-token reuse is strict.** If an assistant retries a refresh after
  a network failure with the old token, the connection is ended and the
  person has to connect again.
- **Not yet tested with specific assistants.** See the note under
  [What you need](#what-you-need).

## Troubleshooting

| Symptom                                                         | Cause and fix                                                                                                                       |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Browser shows _"This sign-in link isn't valid…"_                | The assistant used an unknown client or an unregistered redirect address. Remove the connector and add it again                     |
| _"This connection request has expired or was already answered"_ | More than 10 minutes passed, or the page was answered in another tab. Start connecting again from the assistant                     |
| Signed in but sent to organisation setup                        | The account isn't in an organisation yet. Join or create one first                                                                  |
| Assistant says it's not authorized / asks to reconnect          | The connection was disconnected, expired (90 days), or ended after refresh-token reuse, or the person was offboarded. Connect again |
| _"Your subscription has expired…"_ (403)                        | The organisation's plan has lapsed. Renew it, then connect again if the assistant has dropped the connection                        |
| A tool says the connection _"wasn't given access to that"_      | That item was unticked at consent. Disconnect and connect again, ticking it                                                         |
| `get_my_salary` says nothing is on record                       | No salary structure exists for that month                                                                                           |

---

## For developers

### Where things are

| Path                                               | What                                                                                            |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `apps/api-gateway/src/mcp/router.ts`               | HTTP surface: metadata, OAuth endpoints, `/mcp`, `/mcp/public`, limits, per-request `McpServer` |
| `apps/api-gateway/src/mcp/oauth.ts`                | Authorization server: registration, authorize, codes, token, refresh rotation, revocation       |
| `apps/api-gateway/src/mcp/consent.ts`              | Web-session APIs: consent request, approve/deny, list/revoke own connections                    |
| `apps/api-gateway/src/mcp/principal.ts`            | Bearer verification, per-call account checks, `runAsTenant`                                     |
| `apps/api-gateway/src/mcp/tools.ts`                | Tool definitions                                                                                |
| `apps/api-gateway/src/mcp/config.ts`               | Issuer, scopes, lifetimes, signing-key derivation                                               |
| `apps/web/src/features/assistant/`                 | AI Assistants page and consent screen                                                           |
| `packages/database` — `McpOAuthClient`, `McpGrant` | Master-DB models (indexes created at boot by `ensureMasterIndexes`)                             |

The MCP endpoint lives in the API gateway, not in a separate service. It uses
the official `@modelcontextprotocol/sdk` (Streamable HTTP, stateless: a fresh
server per request, so any worker or replica can serve any call). It is
mounted ahead of CSRF and the web CORS policy because it never reads cookies.
The consent APIs under `/api/v1/ai-connections` remain CSRF-protected.

### Adding a tool

1. Add a `ToolDef` in `tools.ts` with a **strict** zod schema, a scope, and a
   `run` that uses `principal.userId` (never an argument) and calls the same
   service or helper as the equivalent web endpoint.
2. If it needs a new consent item, add a scope in `config.ts`. The
   description appears on the consent screen.
3. Before exposing anything beyond the caller's own records (team views,
   other employees), reuse the web endpoint's exact authorization rule and
   add tests for the boundary.
4. Add tests to `src/__tests__/mcpTools.test.ts`.

### Configuration

No new required variables or secrets.

| Variable                               | Default                         | Purpose                                                                                    |
| -------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------ |
| `MCP_ISSUER_URL`                       | origin of `GOOGLE_CALLBACK_URL` | Public gateway origin: the OAuth issuer, with `/mcp` as the token audience                 |
| `CLIENT_URL` (existing)                | —                               | First entry is where the consent screen is opened                                          |
| `ACCESS_JWT_TOKEN` (existing)          | —                               | The MCP signing key is HMAC-derived from it. Rotating it invalidates MCP access tokens too |
| `OLLAMA_URL`, `OLLAMA_MODEL` (chatbot) | —                               | No longer used by the gateway's chat path. Still used by AI Insights and resume scoring    |

### Trying it locally

```bash
# discovery and the 401 challenge
curl -sk https://localhost:9002/.well-known/oauth-protected-resource/mcp
curl -sk -i -X POST https://localhost:9002/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# public tools, no sign-in
curl -sk -X POST https://localhost:9002/mcp/public \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_job_openings","arguments":{"organisation":"acme-corp"}}}'
```

For the full OAuth flow, point the [MCP Inspector](https://github.com/modelcontextprotocol/inspector)
at `https://localhost:9002/mcp`. Its loopback callback URL is accepted.
