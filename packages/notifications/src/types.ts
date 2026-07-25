import type { EmailJobData, NotificationJobData } from "@hrms/queue";

// Catalog of every business event that can trigger a notification — grows
// as each handler migrates onto notify() (see the phased plan this package
// exists to support). A plain string union rather than a closed enum so
// adding a new event is a one-line, non-breaking addition. Keep names
// aligned with the BullMQ job names the pre-migration handlers already used
// for the same event, so worker-side logs/metrics don't change meaning
// mid-migration.
export type NotificationEventType =
  // leave-service
  | "leaveApplied"
  | "leaveApproved"
  | "leaveRejected"
  | "leaveCancellationRequested"
  | "leaveCancelled"
  | "leaveCancellationRejected"
  // attendance-service
  | "leaveAutoCancelled"
  // wfh (api-gateway)
  | "wfhRequested"
  | "wfhDecision"
  // recruitment-service
  | "resignationSubmitted"
  | "resignationWithdrawn"
  | "resignationApproved"
  | "resignationRejected"
  | "applicationStatusUpdated"
  | "interviewInvite"
  | "jobApplicationReceived"
  // permissions / assets / helpdesk (api-gateway)
  | "permissionsGranted"
  | "assetAssigned"
  | "assetIssueReported"
  | "helpdeskNotification"
  | "helpdeskSlaBreach"
  // performance-review-service
  | "performanceReviewAssigned"
  | "performanceReviewFinalized"
  // tenant / platform (api-gateway)
  | "tenantWelcome"
  | "joinRequestSubmitted"
  | "joinRequestApproved"
  | "joinRequestRejected"
  | "subscriptionRenewed"
  | "subscriptionPaymentFailed"
  // payroll / tax documents (api-gateway)
  | "salarySlip"
  | "tdsWorksheet"
  // scheduler-service
  | "kycMissing"
  | "kycRejected"
  | "kycPending"
  // employee-service
  | "employeeWelcome"
  | "kycSubmitted"
  | "kycApproved"
  | "kycEditAllowed"
  | "kycEditResolved"
  | "kycEditAccessRequested"
  | "kycRevisionRequested"
  // hrm-service
  | "hrActivityCreated"
  | "hrActivityUpdated"
  | "hrActivityExpired"; // scheduler-service — expiry job, not hrm-service itself

/** In-app channel — persisted to Mongo and broadcast over WebSocket by notificationWorker.ts. Omit entirely to skip in-app for this event. */
export interface NotifyInAppChannel {
  title: string;
  message: string;
  /**
   * Coarser category the frontend bell groups/icons by — e.g.
   * "leave_notification" covers leaveApplied/leaveApproved/leaveRejected/...
   * Distinct from `event` (the specific action this notify() call is for):
   * every pre-migration call site already had a real eventType value, and
   * none of them equal the specific event name, so this is required rather
   * than defaulted from `event` to avoid silently changing what the
   * frontend groups a migrated notification under.
   */
  eventType: string;
  priority?: NotificationJobData["priority"];
  /**
   * Ephemeral mode: no DB row, just a WebSocket ping (+ optional push) —
   * for events that already have a home elsewhere in the UI (e.g. Pending
   * Approvals) and shouldn't also appear as a separate bell notification.
   * See NotificationJobData.silent for the full rationale.
   */
  silent?: boolean;
  socketEvent?: string;
  socketPayload?: Record<string, unknown>;
}

/** Push channel toggle — the actual FCM send is driven by NotifyInAppChannel's presence; this only controls whether it's included. Defaults to enabled whenever inApp is set. */
export interface NotifyPushChannel {
  enabled?: boolean;
}

/** One outbound email. `to` accepts multiple addresses for broadcast-style notifications (e.g. every HR user) — sent as one queued job per address, matching every pre-migration handler's own loop. */
export interface NotifyEmailChannel {
  to: string | string[];
  subject: string;
  html: string;
  from: string;
  replyTo?: string;
  attachments?: EmailJobData["attachments"];
}

export interface NotifyOptions {
  tenantId: string;
  event: NotificationEventType;
  /** Explicit recipient user IDs — preferred over pushTargets/targetUser when already known (skips a username->id lookup in the worker). */
  recipients?: string[];
  /** Recipient usernames — resolved to user IDs by the worker. */
  pushTargets?: string[];
  targetUser?: string | string[];
  inApp?: NotifyInAppChannel;
  push?: NotifyPushChannel;
  email?: NotifyEmailChannel;
  metadata?: Record<string, unknown>;
}

export interface NotifyResult {
  /**
   * Correlation id for this notify() call, shared across every channel job
   * it enqueues. Not yet consumed by any worker (that starts once the
   * dispatcher owns cross-queue dedup) — minted now so every migrated call
   * site already carries it, instead of retrofitting it onto job payloads
   * later.
   */
  notificationId: string;
  /** BullMQ job ids actually enqueued, one per channel that fired. */
  jobIds: {
    inApp?: string;
    email?: string[];
  };
}
