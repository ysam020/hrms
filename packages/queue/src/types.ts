export interface EmailJobData {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

export interface NotificationJobData {
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
  | "retryFailedWebhooks" // sweep for pending/failed webhook deliveries
  // Dev-only recurring demo-data seeders — no-op outside local dev, see
  // apps/scheduler-service/src/utils/devSeedGuard.ts
  | "seedDailyAttendance"
  | "seedHrActivities"
  | "seedJobOpenings"
  | "seedPayroll";

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
