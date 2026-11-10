# Website leads (Book a Demo, Contact Sales)

Visitors to praesto.in can request a demo or contact sales. Each request
becomes a **lead** in Praesto's own master database. The Praesto team works the
lead in the Platform Console. Google Analytics only counts that a form was
sent. It never receives anything the visitor typed.

```
praesto.in ──CTA──► /book-demo or /contact ──POST /api/v1/public/leads──► gateway
   │                       │                                                  │
   │ first page of visit:  │ on 201: dataLayer demo_request /                 ├─ leads (master DB)
   │ utm_*, landing path,  │ contact_submit (form_type only)                  ├─ notify(): team in-app + email
   │ referrer host →       │                                                  │   (company, size, type only)
   │ sessionStorage        │                                                  └─ notify(): acknowledgement
   ▼                       ▼                                                      email to the prospect
 app/attribution.ts   features/public/LeadForm.tsx         Platform Console › Leads (view_leads / manage_leads)
```

## Website

| Where                        | CTA                                                        | Goes to                                                             | Event                            |
| ---------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------- |
| Nav                          | Start Free Trial                                           | `/login` (Google sign-in → organisation setup with the trial offer) | `sign_up_click`                  |
| Hero (signed out)            | Start Free Trial · Book a Demo                             | `/login` · `/book-demo`                                             | `sign_up_click` · `cta_click`    |
| Pricing                      | Choose ‹plan› · Contact Sales · Get a Custom HRMS Solution | `/login` · `/contact` · `/contact?topic=custom`                     | `sign_up_click` · `cta_click` ×2 |
| Closing section (signed out) | Start Free Trial · Book a Demo                             | as hero                                                             | as hero                          |
| Mobile menu, footer          | Book a Demo (and Contact Sales in the footer)              |                                                                     | `cta_click`                      |

- **Trial length:** "Start Free Trial" names no length. It's server-configured
  (`TRIAL_DAYS`), and eligibility is checked at organisation setup.
- **Forms:** the forms (`features/public/LeadForm.tsx`) use the UI kit fields
  and the policy pages' layout.
  - **Required:** name, work email, company, company size and consent.
  - **Optional:** phone, designation, message, and for demos a preferred date
    and part of the day (IST).
  - **Custom solution:** for the custom-solution topic, a message is required:
    it's the request itself.
- **Not prerendered:** `/book-demo` and `/contact` are served by the SPA
  fallback rule, so no hosting rewrite was needed. They're listed in
  `PUBLIC_PAGES` (titles, descriptions, analytics), but not in the sitemap. To
  prerender them later, follow docs/seo.md and add the Amplify rewrites.

## Attribution

`app/attribution.ts` stores, once per tab session, the first public page's
`utm_source/medium/campaign/term/content/id`, the landing path and the
referrer's host name, in `sessionStorage`. There's no cookie, and it's gone
when the tab closes.

- **When it's sent:** only inside a submitted form.
- **Server-side:** the gateway sanitises everything again (`config/leads.ts`).
  It keeps short labels only, drops anything with an `@`, `%40` or 7+ digit
  run, keeps paths without query strings, and keeps bare host names.
- **Channel:** a lead's channel is its `utm_source`, else the referrer, else
  `direct`.

## Data

Model `Lead` (collection `leads`, master DB; `packages/database/src/prisma/schema.prisma`):

| Fields                                                                                                                  | Notes                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `kind`                                                                                                                  | `demo` · `sales` · `custom`                                                                 |
| `name`, `email`, `phone?`, `companyName`, `companySize`, `designation?`, `message?`, `preferredDate?`, `preferredTime?` | Email is trimmed and lower-cased. Phone is E.164 (10-digit Indian numbers get +91)          |
| `freeEmailDomain`                                                                                                       | Webmail hint for the team; nobody is refused                                                |
| `utmSource…utmId`, `landingPage`, `referrerHost`                                                                        | Sanitised first-touch attribution                                                           |
| `status`                                                                                                                | `new` → `contacted` → `qualified` → `demo_scheduled` → `negotiation` → `converted` / `lost` |
| `ownerId`, `lastContactedAt`, `nextFollowUpAt`                                                                          | Follow-up                                                                                   |
| `qualifiedAt`, `demoScheduledAt`, `convertedAt`, `lostAt`                                                               | Set the first time a stage is reached; never moved. A demo implies qualified                |
| `submissionCount`, `lastSubmittedAt`, `lastNotifiedAt`                                                                  | Repeat submissions                                                                          |
| `consentAt`                                                                                                             | When the visitor ticked the consent box                                                     |
| `notes[]`                                                                                                               | Embedded `{id, authorId, body, createdAt}`; `authorId` null = the form                      |
| `purgeAt`                                                                                                               | Retention (below)                                                                           |

**Indexes** (`ensureMasterIndexes`, idempotent, run at gateway boot):

- `{status, createdAt}`
- `{email, status}`
- `{ownerId, status}`
- `{createdAt}`
- the TTL index `{purgeAt}` with `expireAfterSeconds: 0`.

**Retention:** every submission and every staff change sets `purgeAt` to
`LEAD_RETENTION_MONTHS` (default 24) from then. MongoDB deletes the lead, and
its notes, after that. For a deletion request, set the lead to `lost` and
delete it by id with a DB script; there's no delete button.

## Abuse and duplicates

- **Validation:** strict zod schema (`publicLeadSchema`). Unknown fields are
  refused, and consent must be `true`.
- **Rate limit:** **5 POSTs per IP per hour** (`leadWriteLimiter`, Redis), on
  top of the gateway's general limit.
- **Honeypot:** a hidden field `website`. If it's filled, the API answers 201
  as usual and stores nothing.
- **Duplicates:** a Redis `SET NX` lock per email (15 s) blocks near-simultaneous
  submits. The same address and type within 10 minutes is a no-op.
- **Merging:** a later submission while a lead is open merges into it: the
  count goes up and a system note records what changed. A closed (`converted`
  or `lost`) lead starts a new one.
- **Notification limit:** the team and the prospect are each emailed about a
  lead **at most once a day**.
- **Uniform response:** the API's answer is always the same, so it can't be
  used to test whether an address is known.
- **No CAPTCHA:** a CAPTCHA would mean another third-party script, a CSP change
  and keys. If spam gets past the above, Cloudflare Turnstile is the suggested
  next step.

## Platform Console

`Platform Console › Leads` (`/platform-admin/leads`):

- **List:** status tiles, then filters for status, type, owner (mine,
  unassigned or a person) and received-date range, plus search by name,
  company or email.
- **Funnel:** by date range, with lead → demo, demo → customer and
  lead → customer rates, and a channel table.
- **Detail page:** contact details, request, attribution and consent time;
  status, owner, last-contacted and next-follow-up fields; notes.

| Permission                  | Grants                                                                    |
| --------------------------- | ------------------------------------------------------------------------- |
| `PraestoAdmin:view_leads`   | Read leads (including contact details) and receive new-lead notifications |
| `PraestoAdmin:manage_leads` | Change status, owner and dates; add notes; be assigned leads              |

- **Who holds them:** the Praesto org's owner and superusers hold both. Others
  need them granted (Permissions → User Permissions in the Praesto org).
- **No access elsewhere:** customer organisations, including their owners and
  superusers, can never hold them.
- **Audit:** every change and note is written to the platform audit log
  (`lead_update`, `lead_note`). The entry has the lead id and what changed,
  never the prospect's details or the note text.

## Notifications

They use the existing `notify()` → BullMQ queues, with retries. The
`leadReceived` and `leadAcknowledged` events are fire-and-forget, so they never
delay the form's response.

- **Team:** in-app + push + email to everyone with `view_leads`, with company,
  size and request type, plus a console link built from `CLIENT_URL`. No
  name, email or phone.
- **Prospect:** one acknowledgement from `PLATFORM_FROM`, with no promised
  response time.
- **No new email configuration:** the existing email worker and provider send
  both.

## Reporting

| Question                                                                        | Source                             |
| ------------------------------------------------------------------------------- | ---------------------------------- |
| Visitors, page views, landing pages, pricing views, CTA clicks, traffic sources | GA4 (anonymous)                    |
| Demo requests, contact submissions, sign-ups, trials (counts)                   | GA4 key events                     |
| Leads, stages, owners, lead → demo → customer rates, channel performance        | Platform Console › Leads (backend) |

The two are never joined per person: GA4 has no lead id, email or name.

## Deploying

1. **Deploy the gateway image** (`api-gateway`). At boot it creates the
   `leads` indexes, including the TTL index; nothing else in the database
   changes. No `prisma db push`.
2. **Deploy the web app** (merge to `main` → Amplify).
3. **Grant access:** grant `PraestoAdmin:view_leads` / `manage_leads` to the
   people who handle sales. The owner already has them. Until someone holds
   `view_leads`, new leads are stored but nobody is notified (logged as a
   warning).
4. **GTM/GA4:** follow docs/analytics.md (the regex trigger now includes
   `demo_request|contact_submit|free_trial_start`; mark them as key events).
5. **Optional environment:** `LEAD_RETENTION_MONTHS` (1–120, default 24). The
   rate limit is fixed at 5/h in production.
