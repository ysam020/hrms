export interface EmailJobData {
  to: string;
  subject: string;
  html: string;
  from?: string;
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
}

export interface ResumeParsingJobData {
  applicationId: string;
}

// Webhook delivery – dispatched by webhookEmitter.ts, processed by deliverWebhook.ts
export interface WebhookDeliveryJobData {
  deliveryId: string;
}
