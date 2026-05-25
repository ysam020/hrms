# Background Jobs

Background processing uses **BullMQ** backed by **Redis**. Job definitions are shared via `@hrms/queue`; workers run inside `apps/scheduler-service`.

---

## Architecture

```
@hrms/queue
  ├── emailQueue
  ├── notificationQueue
  └── schedulerQueue

apps/scheduler-service
  ├── scheduler.ts    — registers repeating cron jobs at startup
  └── worker.ts       — processes jobs as they are dequeued
          │
          ├── Cron jobs (time-based)
          │     reconcileAttendance, updateLeaveBalance, …
          │
          └── Async jobs (event-driven)
                parseResumeScore, razorpayWebhook, sendEmail, …
```

All workers connect to the same Redis instance used for session caching and Socket.IO. The scheduler-service should run as a **single instance** to prevent duplicate cron executions — or use BullMQ's built-in job ID deduplication for idempotent jobs.

---

## Job Queues

Three queues are defined in `packages/queue/src/queues.ts`:

| Queue               | Purpose                                                             |
| ------------------- | ------------------------------------------------------------------- |
| `emailQueue`        | Transactional email dispatch (KYC reminders, login alerts, welcome) |
| `notificationQueue` | FCM push notification dispatch                                      |
| `schedulerQueue`    | All cron jobs + async background tasks                              |

---

## Scheduled (Cron) Jobs

All cron jobs run in `schedulerQueue`. Each job payload carries `{ jobName: SchedulerJobName }` so a single worker switch-statement dispatches to the correct handler.

| Job                         | Cron pattern | Runs at                | What it does                                                                     |
| --------------------------- | ------------ | ---------------------- | -------------------------------------------------------------------------------- |
| `updateExpiredHrActivities` | `0 1 * * *`  | 1:00 AM daily          | Marks HR events whose end date has passed as expired                             |
| `updateExpiredJobOpenings`  | `0 1 * * *`  | 1:00 AM daily          | Closes job postings whose `applicationDeadline` has passed                       |
| `updateEmployeeStatus`      | `15 0 * * *` | 12:15 AM daily         | Transitions employees: probation → active, pending resignation → resigned/left   |
| `reconcileAttendance`       | `15 0 * * *` | 12:15 AM daily         | Auto-marks `Absent` for employees with no check-in recorded for the previous day |
| `updateLeaveBalance`        | `30 0 1 * *` | 1st of month, 12:30 AM | Resets monthly leave quotas; accrues earned/paid leave according to org settings |
| `sendKycReminders`          | `0 9 * * *`  | 9:00 AM daily          | Emails employees who have not submitted KYC documents                            |
| `cleanupFcmTokens`          | `0 2 * * *`  | 2:00 AM daily          | Removes expired or revoked FCM device tokens from the database                   |

### How cron jobs are registered

```typescript
// apps/scheduler-service/src/scheduler.ts
const JOB_SCHEDULES: Array<{ name: SchedulerJobName; pattern: string }> = [
  { name: "updateExpiredHrActivities", pattern: "0 1 * * *" },
  { name: "reconcileAttendance", pattern: "15 0 * * *" },
  { name: "updateLeaveBalance", pattern: "30 0 1 * *" },
  // …
];

for (const { name, pattern } of JOB_SCHEDULES) {
  await schedulerQueue.add(
    name,
    { jobName: name },
    { repeat: { pattern }, removeOnComplete: true },
  );
}
```

BullMQ stores repeat schedules in a Redis sorted set keyed by job name. Re-registering the same job on restart is idempotent.

### Worker processing

```typescript
// apps/scheduler-service/src/worker.ts
const worker = new Worker(
  SCHEDULER_QUEUE,
  async (job) => {
    switch (job.data.jobName) {
      case "reconcileAttendance":
        await reconcileAttendance();
        break;
      case "updateLeaveBalance":
        await updateLeaveBalance();
        break;
      // …
    }
  },
  { connection: redisConnection },
);

worker.on("failed", (job, err) => {
  logger.error(`Job ${job?.name} failed`, { error: err });
});
```

Failed jobs are retried according to BullMQ's built-in exponential back-off strategy.

---

## Async (Event-Driven) Jobs

These jobs are queued by other parts of the system in response to events, not on a time schedule.

### AI Resume Scoring

**Trigger:** A new `JobApplication` is created.  
**Queue:** `schedulerQueue`  
**Job name:** `parseResumeScore`

Steps:

1. Download the resume PDF from S3.
2. Extract text via `pdf-parse`.
3. Send text + job description to Ollama (qwen2.5-coder:14b) for evaluation.
4. Persist `aiScore` (0–100) and `aiNotes` on the `JobApplication` record.
5. If `aiScore` is below the org's configured threshold, optionally auto-reject the application.

### Razorpay Webhook Processing

**Trigger:** Razorpay sends a signed webhook to `POST /api/payment/webhook`.  
**Queue:** `schedulerQueue`  
**Job name:** `razorpayWebhook`

The gateway validates the webhook signature synchronously and responds 200 immediately, then enqueues the payload for async processing:

| Razorpay event                | Effect on `Tenant`                                                     |
| ----------------------------- | ---------------------------------------------------------------------- |
| `subscription.activated`      | `subscriptionStatus = "active"`, set `planActivatedAt`                 |
| `subscription.charged`        | Extend `planExpiresAt`; clear `grace_period` if applicable             |
| `subscription.payment_failed` | Transition to `grace_period` (if first failure)                        |
| `subscription.deactivated`    | `subscriptionStatus = "expired"`                                       |
| `subscription.cancelled`      | `subscriptionStatus = "cancelling"` or `"expired"` depending on timing |

### Email Dispatch

**Trigger:** Various — KYC reminder cron, login risk alert, welcome email, leave decision, etc.  
**Queue:** `emailQueue`

A Nodemailer-based worker processes email jobs. Templates use a base HTML layout from the assets directory. Retry on failure with exponential back-off.

---

## Adding a New Job

1. Add the job name to the `SchedulerJobName` union type in `@hrms/queue/src/types.ts`.
2. Create a handler file in `apps/scheduler-service/src/jobs/my-new-job.ts`.
3. If it's a cron job, register the schedule in `scheduler.ts`:
   ```typescript
   { name: "myNewJob", pattern: "0 3 * * *" }
   ```
4. Add a `case` in the worker switch in `worker.ts`.
5. If it's an event-driven job, queue it from the triggering location:
   ```typescript
   import { schedulerQueue } from "@hrms/queue";
   await schedulerQueue.add("myNewJob", { jobName: "myNewJob", ...payload });
   ```

---

## Leave Balance Logic

`updateLeaveBalance` runs on the 1st of each month for every active tenant:

1. Reads the active `TenantSettings` (latest row where `effectiveFrom ≤ now()`).
2. Resets monthly leave quotas (`casual`, `sick`) to the configured annual entitlement ÷ 12.
3. Accrues earned/paid leave: adds 1/12 of `paidLeavesPerYear` to `accumulatedPLBeforeCurrentMonth`.
4. Applies any custom leave types from `TenantSettings.customLeaveTypes`.

This means leave policy changes scheduled via `TenantSettings.effectiveFrom` are automatically picked up by the next monthly reset without any code change.

---

## Monitoring

BullMQ exposes a Bull Board dashboard mountable in the API gateway for development:

```
https://localhost:9002/admin/queues
```

Shows queue depths, job counts, failed jobs, and retry status. **Restrict or disable in production.**

Failed jobs remain in the BullMQ `failed` set and can be retried manually via the dashboard or the BullMQ API.
