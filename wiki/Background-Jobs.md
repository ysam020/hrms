# Background Jobs

Background processing uses **BullMQ** backed by **Redis**. Job definitions are shared via `@hrms/queue`; workers run inside `apps/scheduler-service`.

---

## Architecture

```
@hrms/queue
  └── defines job queues and types

apps/scheduler-service
  ├── scheduler.ts   — registers repeating cron jobs
  └── worker.ts      — processes jobs as they are due
```

All workers connect to the same Redis instance used for session caching and Socket.IO.

---

## Job Queues

Three queues are defined in `packages/queue/src/queues.ts`:

| Queue               | Purpose                                                             |
| ------------------- | ------------------------------------------------------------------- |
| `emailQueue`        | Transactional email dispatch (password resets, KYC reminders, etc.) |
| `notificationQueue` | FCM push notification dispatch                                      |
| `schedulerQueue`    | Recurring cron jobs                                                 |

---

## Scheduled Jobs

All cron jobs run in the `schedulerQueue`. Job payloads carry `{ jobName: SchedulerJobName }` so a single worker function can dispatch to the correct handler.

| Job                         | Cron         | Runs at                | What it does                                                                      |
| --------------------------- | ------------ | ---------------------- | --------------------------------------------------------------------------------- |
| `updateExpiredHrActivities` | `0 1 * * *`  | 1:00 AM daily          | Marks HR events whose end date has passed as expired                              |
| `updateExpiredJobOpenings`  | `0 1 * * *`  | 1:00 AM daily          | Closes job postings past their application deadline                               |
| `updateEmployeeStatus`      | `15 0 * * *` | 12:15 AM daily         | Transitions employees: probation → active, resignation pending → resigned, etc.   |
| `reconcileAttendance`       | `15 0 * * *` | 12:15 AM daily         | Auto-marks employees as `Absent` if no check-in was recorded for the previous day |
| `updateLeaveBalance`        | `30 0 1 * *` | 1st of month, 12:30 AM | Resets monthly leave quotas and accrues earned leave                              |
| `sendKycReminders`          | `0 9 * * *`  | 9:00 AM daily          | Emails employees who have not yet submitted KYC documents                         |
| `cleanupFcmTokens`          | `0 2 * * *`  | 2:00 AM daily          | Removes expired or revoked FCM device tokens from the database                    |

---

## How Cron Jobs Are Registered

```typescript
// apps/scheduler-service/src/scheduler.ts
const JOB_SCHEDULES = [
  { name: "updateExpiredHrActivities", pattern: "0 1 * * *" },
  { name: "reconcileAttendance", pattern: "15 0 * * *" },
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

BullMQ uses the Redis `ZADD` sorted-set internally to track the next run time for each repeating job.

---

## Worker Processing

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

## Adding a New Job

1. Add the job name to the `SchedulerJobName` union type in `@hrms/queue/src/types.ts`.
2. Create a handler file in `apps/scheduler-service/src/jobs/my-new-job.ts`.
3. Register the schedule in `scheduler.ts`:
   ```typescript
   { name: 'myNewJob', pattern: '0 3 * * *' }
   ```
4. Add a `case` in `worker.ts` to call your handler.

---

## Email Queue

The `emailQueue` is consumed by a separate email worker (also in scheduler-service). Jobs are added by other services (e.g., `sendKycReminders` publishes email jobs) and processed by a Nodemailer-based handler.

Email templates use the base HTML template from `server/shared/assets/emailBaseTemplate.html` (or equivalent in the monorepo).

---

## Monitoring

BullMQ exposes a `Bull Board` dashboard that can be mounted in the API gateway for development:

```
https://localhost:9002/admin/queues
```

This shows queue depths, job counts, failed jobs, and retry status. Disable or restrict access in production.
