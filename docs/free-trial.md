# Free trial

How a new organisation's free trial works, what enforces it, and how to configure and deploy it. Code: `apps/api-gateway/src/config/trial.ts` (rules), `apps/api-gateway/src/services/trial.ts` (eligibility), `handlers/payment.ts` and `handlers/tenant.ts` (lifecycle), `middleware/requireActiveSubscription.ts` (access), `apps/scheduler-service/src/jobs/checkSubscriptionExpiry.ts` and `sendTrialReminders.ts` (jobs), `apps/web/src/features/public/OrgSetup.tsx` and `features/subscription/Subscription.tsx` (UI).

## Business rules

| Rule                | Value                                                                                                                                                                                                                            | Where                                                                         |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Length              | 14 days (`TRIAL_DAYS`, 1–90)                                                                                                                                                                                                     | `config/trial.ts`; the web app reads it from `GET /payment/trial-eligibility` |
| Payment details     | Required. UPI Autopay or e-Mandate is authorised at signup, and Razorpay runs a small authentication transaction that it refunds automatically.                                                                                  | `createSubscription` sets `start_at` to the trial end                         |
| First charge        | Taken automatically at the trial end through that mandate, for the tier and billing chosen at signup                                                                                                                             | Razorpay; `subscription.charged` webhook                                      |
| Who gets one        | One trial per **organisation**. Refused when the creating account already owns an organisation, the company email domain already has any organisation, or any signal (account, domain, UPI handle) was used for an earlier trial | `services/trial.ts`                                                           |
| During the trial    | Every feature, and the chosen tier's seat limit, the same as paid                                                                                                                                                                | `planTier` is set at signup                                                   |
| Cancel during trial | The mandate is cancelled immediately, so nothing is ever charged. Access continues until the trial end and is then blocked.                                                                                                      | `cancelSubscription`                                                          |
| First charge fails  | The status stays `trialing` for 1 day while the debit settles, then moves to `grace_period` with full access and a banner, then to `expired` 7 days after the trial end                                                          | `checkSubscriptionExpiry`                                                     |
| After expiry        | HRMS APIs return 402. Sign-in, account, org profile, billing and the Subscription page stay open. **No data is deleted.**                                                                                                        | `requireActiveSubscription`                                                   |
| Existing tenants    | Unchanged. They have no trial fields, never become `trialing`, and their owners can't start a trial.                                                                                                                             | —                                                                             |

## Lifecycle

```
org setup ──(trial: true, eligible)──► Razorpay subscription, start_at = now + TRIAL_DAYS
   │                                    Checkout authorises the mandate (no charge)
   ▼
buildTenant: verify signature → read subscription from Razorpay → re-check eligibility
             → claimTrial (unique keys, atomic) → tenant "trialing", planExpiresAt = trialEndsAt
   │
   ├─ cancel ──────────────► "cancelled" (mandate cancelled now) → access until trialEndsAt → 402
   ├─ change plan / method ► new deferred mandate (same start_at), swapped in on confirm, stays "trialing"
   ▼
trial end: Razorpay charges ──► subscription.charged ──► "active", planActivatedAt = now, next cycle
              │ (not charged after 1 day)
              ▼
         "grace_period" (halted webhook or scheduler) ──7 days after trial end──► "expired" (402)
```

How the code enforces it:

- **Trial status comes from Razorpay's record, not the client.** `buildTenant` fetches the subscription and treats a future `start_at` as a trial only when `notes.purpose = "trial_signup"`, `notes.userId` is the caller, and the start is within `TRIAL_DAYS` + 1 day. Tier and billing come from those notes. Any other subscription whose first charge is still in the future is rejected, including a payment-method-change subscription that was never charged.
- **Race safety.** Each signal is a `TrialClaim` row with a unique `key`. Of two concurrent signups sharing a signal, exactly one inserts it. The other rolls back its own rows, and its uncharged mandate is cancelled. A retry of the same signup re-claims its own keys and is not refused.
- **Timestamps** are all server-generated and stored in UTC. Emails show dates in Asia/Kolkata. Reminder windows are measured from "now", so the cron time zone doesn't matter.
- **Webhooks** keep their existing HMAC verification and event-id idempotency (Redis `SET NX`). Events for a subscription that has since been replaced match no tenant and change nothing. A late `subscription.charged` after the status moved to `grace_period` or `cancelled` still activates the tenant, because the money was taken. The reconciler now also covers `trialing` tenants, so a missed first-charge webhook gets healed.
- **Role check.** All mutating `/payment/*` routes now need `requireSubscriptionManager`: owner, admin, superuser or a `Subscription:*` permission. Before this change, any member of the tenant could call them.
- **Logs** record tenant and subscription ids. They never contain emails or UPI handles, and UPI handles are stored only as SHA-256 hashes.

## Reminders

`sendTrialReminders` runs daily at 09:30 in the scheduler's time zone. It emails the owner 3 days before the trial end and again 1 day before, through the existing `notify()` email queue with Praesto branding. Only tenants still `trialing` are considered, so cancelled or converted trials get nothing. Each reminder is claimed with a conditional `push` onto `trialRemindersSent` before it is queued, so retries and overlapping runs never send it twice. Razorpay's own pre-debit notification for the mandate is separate from this.

## Configuration

| Setting                    | Where                                                                     | Default                   |
| -------------------------- | ------------------------------------------------------------------------- | ------------------------- |
| `TRIAL_DAYS`               | api-gateway env                                                           | `14`                      |
| Trial grace                | `TRIAL_GRACE_MS` in `config/trial.ts`, `GRACE_PERIOD_MS` in the scheduler | 7 days (the same as paid) |
| First-charge settle window | `FIRST_CHARGE_SETTLE_MS` in `checkSubscriptionExpiry.ts`                  | 1 day                     |
| Reminder schedule          | `scheduler.ts`                                                            | `30 9 * * *`              |

Razorpay needs no new configuration. The webhook already subscribes to `subscription.charged`, `subscription.halted`, `subscription.payment.failed`, `subscription.cancelled` and `subscription.completed`, which are all the events the trial uses. Plans are reused per tier and billing.

## Database

MongoDB through Prisma, with no destructive migration:

- `Tenant`: optional `trialStartedAt`, `trialEndsAt`, and `trialRemindersSent` (defaults to `[]`). Existing rows don't need a backfill.
- A new master-DB collection, `trial_claims` (`TrialClaim`). Its unique index on `key` is created at gateway boot by `ensureMasterIndexes()`. It's safe to run more than once.
- The new `subscriptionStatus` value is `"trialing"`.

## Deploying

1. Run `pnpm --filter @hrms/db db:generate`. Optionally also run `db:push` against the master DB. It isn't required, because the gateway creates the index at boot.
2. Deploy **api-gateway and scheduler-service together**. If the gateway goes alone, trials still work, but there are no reminders, and the move to grace or expiry relies on the gateway's live check.
3. Deploy the web app last. Until it ships, signups use the existing paid flow.
4. Smoke test in Razorpay **test mode**:
   1. Start a trial, authorise the test mandate, and confirm that `GET /tenants/me` shows `trialing` and that no capture appears in the Razorpay dashboard.
   2. Cancel it, and confirm the Razorpay subscription is `cancelled`.
   3. Start a second trial for the same domain and confirm the paid-plan message.

To roll back, redeploy the previous images. Existing trial tenants keep working: the old access check allows any status it doesn't recognise, and the old webhook still activates them when they're first charged. But the old scheduler ignores `trialing`, so an **unpaid** trial would keep access indefinitely. After a rollback, move those tenants to `expired` by hand once their `trialEndsAt` is more than 7 days past.
