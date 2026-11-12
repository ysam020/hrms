/** What producers enqueue: the job data below, sealed (see @hrms/crypto
 * sealTransient). Workers open it with openJobData. */
export interface SealedJobData {
  sealed: string;
  tenantId?: string;
  requestId?: string;
}

export interface EmailJobData {
  to: string;
  subject: string;
  html: string;
  /** Required — resolve via @hrms/common's tenantFrom()/PLATFORM_FROM so every
   * email uses one of the two verified Resend sending identities. */
  from: string;
  replyTo?: string;
  /** Base64-encoded file content — BullMQ job data is JSON (no Buffers), and
   * Resend's API accepts base64 attachment content directly, so no decode
   * step is needed on the consumer side either. contentType matters beyond
   * file correctness — e.g. a calendar invite needs
   * `text/calendar; method=REQUEST` for Gmail/Outlook to render it as an
   * interactive invite card instead of a plain attachment. */
  attachments?: { filename: string; content: string; contentType?: string }[];
  /** Correlation ID from the HTTP/gRPC request that enqueued this job — see
   * NotificationJobData.requestId below for why. */
  requestId?: string;
}

export interface NotificationJobData {
  /** Tenant this notification belongs to — required so the worker persists
   * it into that tenant's own database instead of the shared master DB. */
  tenantId: string;
  title: string;
  message: string;
  /** User IDs (ObjectId strings) to notify — the preferred way to target. */
  recipients?: string[];
  /** Usernames to notify, used only when `recipients` is empty. */
  pushTargets?: string[];
  /** Usernames (legacy). A user ID here is also accepted, for jobs enqueued
   * before producers switched to `recipients`. */
  targetUser?: string | string[];
  /**
   * Explicit fan-out instead of named recipients. Without this, a job whose
   * targets resolve to nobody in its tenant fails rather than reaching
   * anyone else. "tenant" reaches every user of `tenantId`; "platform"
   * reaches every user of every tenant and is refused unless `tenantId` is
   * the platform tenant and the authorizer is named.
   */
  broadcast?: NotificationBroadcast;
  eventType?: string;
  sendPushNotification?: boolean;
  priority?: "high" | "medium" | "low";
  /** App-relative deep link ("/approvals") — persisted on the bell row and
   * sent as the push tap target. The worker drops anything safeAppLink()
   * (@hrms/common) rejects. */
  link?: string;
  /** Preference category (see NotificationCategory in @hrms/notifications). */
  category?: string;
  metadata?: Record<string, unknown>;
  /**
   * When set, also emits this event name (with socketPayload, or the
   * persisted notification if socketPayload is omitted) to every WS target
   * — for UI surfaces that need to react precisely (live-refresh a specific
   * view) rather than just showing a generic notification toast.
   */
  socketEvent?: string;
  socketPayload?: Record<string, unknown>;
  /**
   * When true, this job is a live-refresh ping, not a user-facing
   * notification: the worker still broadcasts on the "notification" socket
   * channel (so listeners like the Pending Approvals badge still refetch)
   * and can still send a push, but it does NOT persist a Notification row
   * or appear in the bell/notifications list. Use this for events that
   * already have a home elsewhere in the UI (e.g. a new leave/resignation/
   * KYC/join-request submission, which already shows up in Pending
   * Approvals) so they aren't duplicated as a separate notification.
   */
  silent?: boolean;
  /** Correlation ID from the HTTP request that enqueued this job (see
   * @hrms/logger's requestIdStorage/getRequestId) — threaded into the
   * worker's log lines so a request that fans out into a queued job can
   * still be traced end-to-end, not just across HTTP -> gRPC. */
  requestId?: string;
}

export type NotificationBroadcast =
  | { scope: "tenant" }
  | { scope: "platform"; authorizedBy: string; reason: string };

export type SchedulerJobName =
  | "updateExpiredHrActivities"
  | "updateExpiredJobOpenings"
  | "updateEmployeeStatus"
  | "reconcileAttendance"
  | "updateLeaveBalance"
  | "sendKycReminders"
  | "cleanupFcmTokens"
  | "checkSubscriptionExpiry"
  | "sendTrialReminders"
  // New scheduler jobs
  | "checkTicketSla"; // lazily mark helpdesk SLA as breached

export interface SchedulerJobData {
  jobName: SchedulerJobName;
  // Optional extra context for non-standard jobs (e.g. ticketId for SLA check)
  ticketId?: string;
  /** Tenant owning `ticketId` — the ticket lives in that tenant's database. */
  tenantId?: string;
  /** Set only for the (rare) manually-triggered case; absent for the normal
   * timer-driven cron adds, which have no originating request to trace. */
  requestId?: string;
}

export interface ResumeParsingJobData {
  applicationId: string;
  /** Tenant owning the application — it lives in that tenant's database. */
  tenantId: string;
  requestId?: string;
}

// Payroll disbursement — dispatched by updatePayrollRunStatus/retryFailedPayouts
// (api-gateway), processed by payrollDisbursementWorker.ts. Moved out of the
// HTTP handler because it can be 1,000+ sequential external RazorpayX calls
// for a real employee count — far too slow for a single request/response
// cycle. The worker re-derives everything else (line items, run month/year)
// from runId, so the job payload stays minimal.
export interface PayrollDisbursementJobData {
  tenantId: string;
  runId: string;
  disbursedBy: string;
  requestId?: string;
}

// Ends a timed availability status ("busy for 1 hour") — scheduled by the
// gateway's services/presence.ts with a delay, processed by
// presenceExpiryWorker.ts. `revision` is the status revision the job was
// scheduled for: a newer choice bumps it, so a late or duplicate job finds
// a different revision and does nothing.
export interface PresenceExpiryJobData {
  tenantId: string;
  userId: string;
  revision: number;
  requestId?: string;
}
