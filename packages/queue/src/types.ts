export interface EmailJobData {
  to: string;
  subject: string;
  html: string;
  from?: string;
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
  /** Array of user IDs (ObjectId strings) to store as DB recipients */
  recipients?: string[];
  /** Array of usernames to target for push/WS delivery */
  pushTargets?: string[];
  /** Legacy single-target backward compat */
  targetUser?: string | string[];
  eventType?: string;
  sendPushNotification?: boolean;
  priority?: "high" | "medium" | "low";
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

export type SchedulerJobName =
  | "updateExpiredHrActivities"
  | "updateExpiredJobOpenings"
  | "updateEmployeeStatus"
  | "reconcileAttendance"
  | "updateLeaveBalance"
  | "sendKycReminders"
  | "cleanupFcmTokens"
  | "checkSubscriptionExpiry"
  // New scheduler jobs
  | "checkTicketSla" // lazily mark helpdesk SLA as breached
  | "retryFailedWebhooks"; // sweep for pending/failed webhook deliveries

export interface SchedulerJobData {
  jobName: SchedulerJobName;
  // Optional extra context for non-standard jobs (e.g. ticketId for SLA check)
  ticketId?: string;
  /** Set only for the (rare) manually-triggered case; absent for the normal
   * timer-driven cron adds, which have no originating request to trace. */
  requestId?: string;
}

export interface ResumeParsingJobData {
  applicationId: string;
  requestId?: string;
}

// Webhook delivery – dispatched by webhookEmitter.ts, processed by deliverWebhook.ts
export interface WebhookDeliveryJobData {
  deliveryId: string;
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
