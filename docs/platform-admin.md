# Praesto Platform Console (`/platform-admin`)

Internal SaaS administration for Praesto's own team: customer organisations,
their size, subscriptions, payments and revenue. Not an HR dashboard. It never
shows employee records, only counts.

## Architecture

- **Web:** `apps/web/src/features/platform-admin/` (Overview, Tenants + detail,
  Billing = Subscriptions/Payments/Revenue, AuditLog, shared). These pages render
  inside the normal app shell. Under `/platform-admin` the sidebar switches to
  `PLATFORM_NAV` (`app/navigation.ts`), which carries a "Praesto Platform
  Console" label and a link back to the organisation.
- **API:** `apps/api-gateway/src/routes/platformAdmin.ts` is mounted at
  `/api/v1/platform/admin` behind `authenticate` and `idempotency`. There is no
  tenant subscription guard. Each route requires its own PraestoAdmin action
  (`requirePlatformAdmin`). Handlers live in `handlers/platformAdmin.ts`. The
  metric formulas live in `services/platformMetrics.ts`, which is pure and
  unit-tested.
- **Payment ledger:** `BillingPayment` (master `billing_payments`) is a read
  model of Razorpay, maintained by `services/billingLedger.ts`. Before this,
  payments existed only in Razorpay.

## Authorization

Platform rights come from being Praesto's own organisation (`PLATFORM_TENANT_ID`)
together with the existing permissions module, the same model as the support
console. There is no separate roster.

| Who                                                                                                  | Access                                                              |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Owner of the Praesto org, or a superuser in it (or `*:*:*` there)                                    | Every action                                                        |
| Other Praesto org members                                                                            | Only the `PraestoAdmin:<action>` permissions granted to them        |
| Praesto org **admin role** alone                                                                     | Nothing. Billing data is need-to-know, so this differs from support |
| Anyone in any other organisation, including owners, superusers and holders of the permission strings | Nothing                                                             |
| Former (blocked) employees                                                                           | Nothing                                                             |

Actions: `view_overview`, `view_tenants`, `view_billing`, `manage_billing`,
`view_audit_logs`, `view_leads`, `manage_leads`
(`packages/common/src/permissionCatalog.ts`). Leads are covered in
docs/leads.md. They are
platform-only: the gateway rejects them as unknown in any other org, and the
web editor hides them.

- **Granting:** use the existing Permissions → User Permissions page inside the
  Praesto org. Only its owner or superusers can save there (`requireSuperUser`).
  Grants, revocations and superuser toggles in the Praesto org are written to
  the platform audit log.
- **Checks:** access is evaluated live on every request
  (`services/platformAccess.ts`) from the signed token's tenant and the user's
  database record. Request parameters are never consulted. The token's tenant
  must equal the user record's tenant.
- **Profile:** `GET /profile` returns `platformAdmin: string[]`. The UI uses it
  only to choose what to show.

## API

| Method & path                                                                | Action          | Purpose                                                                                                                            |
| ---------------------------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| GET `/platform/admin/overview?range=30d\|90d\|12m\|ytd\|all` or `?from=&to=` | view_overview   | KPIs and trends. The `billing` block is only included with view_billing                                                            |
| GET `/platform/admin/tenants`                                                | view_tenants    | Directory. Filters: status, plan, kind, account, access, payment\*, registeredFrom/To, min/maxEmployees, search, sort, page, limit |
| GET `/platform/admin/tenants/:id`                                            | view_tenants    | Detail. Payments and Razorpay ids are only included with view_billing                                                              |
| POST `/platform/admin/tenants/:id/sync` `{reason}`                           | manage_billing  | Runs the reconciler's own `reconcileTenant` (for statuses the reconciler heals), then a full ledger sync for the tenant. Audited   |
| GET `/platform/admin/subscriptions`                                          | view_billing    | Lifecycle counts, trials, and attention lists                                                                                      |
| GET `/platform/admin/payments`                                               | view_billing    | The ledger: filters, search by organisation or `pay_`/`inv_`/`sub_` id, pagination                                                 |
| POST `/platform/admin/billing/sync` `{reason}`                               | manage_billing  | Ledger backfill for every subscription. A Redis lease allows one run at a time. Audited                                            |
| GET `/platform/admin/revenue`                                                | view_billing    | Collections, MRR/ARR, billed MRR, revenue by plan and by billing period                                                            |
| GET `/platform/admin/audit-logs`                                             | view_audit_logs | Platform audit trail                                                                                                               |
| GET `/platform/admin/leads`, `/leads/:id`, `/leads/owners`, `/leads/metrics` | view_leads      | Website sales leads: list (filters, search, counts), detail with contact details, assignable owners, funnel. See docs/leads.md     |
| PATCH `/platform/admin/leads/:id`, POST `/platform/admin/leads/:id/notes`    | manage_leads    | Status, owner, contact dates; internal notes. Audited without personal details                                                     |

\* Filtering by payment requires view_billing.

## Metric sources and formulas

Praesto's own organisation is excluded from every customer metric. Calendar
buckets use IST. Money is kept in paise and grouped by currency; amounts in
different currencies are never added together.

| Metric                                 | Source                                                     | Definition                                                                                                                                                                                                                      |
| -------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Organisations / new / growth           | `tenants.createdAt`                                        | New = registered in the range. Growth = % change against the previous range of equal length (null when the previous range had 0)                                                                                                |
| With access                            | `tenants`                                                  | Uses `decideAccess` from `requireActiveSubscription`, the exact rule the subscription guard enforces                                                                                                                            |
| Signed in during period                | master `login_events`                                      | Organisations with at least one member sign-in in the range                                                                                                                                                                     |
| Employee records / active              | master `users` (one `groupBy` on tenantId, employeeStatus) | All users of the org. Active = `employeeStatus: "Active"`, which is the billing seat count and includes the owner                                                                                                               |
| User accounts                          | `tenant_memberships`                                       | Sign-in memberships. Counted separately from employee records                                                                                                                                                                   |
| Employee records added                 | `users.createdAt` (`$group` in the database)               | Records created. This is **not** a headcount history                                                                                                                                                                            |
| Paying                                 | `tenants`                                                  | `status === "active"`, a Razorpay subscription exists, and `planActivatedAt` is set (the first real charge landed)                                                                                                              |
| Trial / past due / cancelled / expired | `tenants.subscriptionStatus`                               | The stored states as-is. Past due = `grace_period`                                                                                                                                                                              |
| Renewing / ending soon                 | `planExpiresAt`                                            | Renewing: paying, with the period ending within 30 days. Ending: cancelled, with access ending within 30 days. Trials: ending within 7 days                                                                                     |
| **MRR (run-rate)**                     | `tenants` + `billingPlans.ts`                              | Σ list price over paying tenants. Annual price ÷ 12. No discounts exist in the code. Grace-period tenants are reported separately as "at risk"; cancelled tenants still inside their paid period are reported as "non-renewing" |
| **ARR**                                |                                                            | Run-rate MRR × 12                                                                                                                                                                                                               |
| **Billed MRR**                         | ledger                                                     | At an instant t: Σ net amount ÷ period months (12 for annual, otherwise 1) over successful payments whose invoice period covers t. Historical. Feeds the MRR trend and month-on-month change                                    |
| **Gross collected**                    | ledger                                                     | Σ `amount` over captured payments, including ones later refunded                                                                                                                                                                |
| **Refunds**                            | ledger                                                     | Σ `amountRefunded`, which is Razorpay's running total on the payment, so a refund is counted once                                                                                                                               |
| **Net collected**                      |                                                            | Gross − refunds. Failed and pending payments are never counted                                                                                                                                                                  |
| ARPA                                   | ledger                                                     | Net ÷ distinct tenants with a successful payment in the range                                                                                                                                                                   |
| **Trial → paid**                       | `tenants`                                                  | Denominator: trials whose `trialEndsAt` falls in [from, min(to, now)). Numerator: those with `planActivatedAt` set. Trials still running are excluded                                                                           |
| By plan / by billing                   | ledger                                                     | Plan is inferred by matching the amount to the price list ("Other amount" when nothing matches, e.g. a prorated upgrade). Billing = the invoice period length (> 45 days counts as annual)                                      |
| Last sign-in, usage (detail page)      | `login_events`, and the tenant's own DB                    | Usage is counted for one tenant only: attendance, leave, job openings, payroll runs and helpdesk tickets over 30 days                                                                                                           |

**Tax:** plans have no separate tax line, so ledger amounts are the gross
amount as charged.

## Payment ledger

- **Schema:** `BillingPayment` in `packages/database/src/prisma/schema.prisma`,
  stored in the master DB and registered in `MASTER_MODELS`. Indexes are
  created by `ensureMasterIndexes` at gateway boot: a unique index on
  `razorpayPaymentId`, plus `(tenantId, paidAt)`, `(paidAt)` and
  `(status, paidAt)`. **Do not `prisma db push` the master database.**
- **Writers:**
  1. The webhook calls `recordWebhookPayment` for `subscription.charged`,
     `payment.failed`, `payment.captured` and `refund.*`.
  2. The 6-hourly reconciler re-reads invoices from the last 45 days for each
     live subscription.
  3. The console's sync actions.
- **Dedup and replay safety:** there is one row per Razorpay payment id. Every
  write copies the payment's current state from `payments.fetch`
  (status, amount_refunded). Values are never incremented, so duplicate or
  out-of-order webhooks converge on the same row.
- **Recorded:** only payments attached to a subscription invoice. Trial
  mandate authorisations have no invoice; they are excluded and refunded by
  Razorpay.
- **Stored:** method type only. No card, VPA, email or contact details.

## Audit log

Platform actions are written to the **Praesto org's own** `auditlogs` with
`entityType: "PlatformAdmin"`. Each entry records the actor, IP, user agent,
action, target tenant, reason, result, details (such as a state diff) and the
request id when one is present. No endpoint edits or deletes audit rows.

## Deploying

1. Set `PLATFORM_TENANT_ID` in the prod `hrms/config` secret. This is also
   still pending from the support console. If it is unset, the console stays
   closed.
2. Rebuild `api-gateway` and `web`. Boot creates the ledger indexes.
3. To grant access, give Praesto org members `PraestoAdmin:*` permissions under
   Permissions → User Permissions. The org owner already has full access.
4. Once, run **Payments → Sync Payments from Razorpay** to import history.
   Until then, every cash figure shows "No payments recorded yet". This step
   writes only to `billing_payments`.
5. Optional: enable the `payment.failed` and `refund.processed` events on the
   Razorpay webhook. Without them, failed attempts are not recorded, and
   refunds appear only after the next sync or reconciler pass.

## Not implemented (data unavailable)

These are listed in the UI as unavailable, never estimated:

- Churn, renewal rate and revenue churn. Tenants store only their current
  status, with no timestamped transitions.
- Historical headcount.
- Acquisition source.
- Cross-tenant feature usage. No telemetry exists; usage is read per tenant on
  the detail page.

Not built:

- **Tenant suspension.** `Tenant.isActive` is not enforced on authenticated
  requests, so suspension would be new behaviour that needs a product decision.
- **Admin-initiated cancel or plan change.** The existing flows are owner-side
  checkouts with mandate constraints; reusing them on a customer's behalf
  needs a decision.

## Known limitations

- Directory filtering runs in the gateway over a projection of every customer
  organisation (about 200 bytes each), plus one aggregation per dimension.
  This is fine to roughly tens of thousands of tenants. Beyond that, move the
  filters into a `$lookup` pipeline.
- Failed-payment counts begin from when the ledger and webhook events were
  enabled. Earlier failures cannot be recovered from invoices.
- Only the current subscription and the immediately previous one are synced.
  Older subscriptions from repeated payment-method swaps are not known to the
  tenant record.
